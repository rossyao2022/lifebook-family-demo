const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_IMAGES = 3;
const MAX_IMAGE_DATA_URL_LENGTH = 2_200_000;

const dimensionNames = [
  "情绪枝",
  "表达枝",
  "社交枝",
  "创造枝",
  "习惯枝",
  "运动枝",
  "亲子枝",
  "探索枝",
];

const sceneNames = ["家庭", "学校", "兴趣活动", "旅行", "生日节日", "亲子对话", "作品成果"];
const moodNames = ["开心", "兴奋", "平静", "勇敢", "紧张", "低落", "生气", "好奇"];

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "story",
    "scene",
    "mood",
    "tags",
    "dimensions",
    "leadingDimension",
    "confidence",
    "summary",
    "highlight",
    "cardTitle",
    "bookLine",
    "visualDescription",
    "companion",
  ],
  properties: {
    title: { type: "string" },
    story: { type: "string" },
    scene: { type: "string", enum: sceneNames },
    mood: { type: "string", enum: moodNames },
    tags: {
      type: "array",
      minItems: 1,
      maxItems: 6,
      items: { type: "string" },
    },
    dimensions: {
      type: "object",
      additionalProperties: false,
      required: dimensionNames,
      properties: Object.fromEntries(dimensionNames.map((name) => [name, { type: "number" }])),
    },
    leadingDimension: { type: "string", enum: dimensionNames },
    confidence: { type: "number" },
    summary: { type: "string" },
    highlight: { type: "string" },
    cardTitle: { type: "string" },
    bookLine: { type: "string" },
    visualDescription: { type: "string" },
    companion: {
      type: "object",
      additionalProperties: false,
      required: ["parentQuestion", "action", "grandparentLine"],
      properties: {
        parentQuestion: { type: "string" },
        action: { type: "string" },
        grandparentLine: { type: "string" },
      },
    },
  },
};

async function analyzeGrowthRecord(payload, options = {}) {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("OPENAI_API_KEY is not configured.");
    error.statusCode = 501;
    error.code = "missing_api_key";
    throw error;
  }

  const normalized = normalizePayload(payload);
  const model = options.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 1800,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "你是「生命之书」的儿童成长记录分析助手。",
                "请基于家长提供的文字和图片，生成温柔、具体、非诊断式的成长观察。",
                "不要识别孩子真实身份，不要推断敏感属性，不要做医学、心理疾病或学习能力诊断。",
                "如果图片信息不足，请诚实降低置信度，并结合文字生成可用的家庭陪伴建议。",
                "输出必须是中文，字段必须符合 JSON Schema。",
              ].join("\n"),
            },
          ],
        },
        {
          role: "user",
          content: buildUserContent(normalized),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "lifebook_growth_analysis",
          strict: true,
          schema: analysisSchema,
        },
      },
    }),
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(responseBody.error?.message || "OpenAI analysis request failed.");
    error.statusCode = response.status;
    error.code = responseBody.error?.code || "openai_error";
    throw error;
  }

  const outputText = extractOutputText(responseBody);
  if (!outputText) {
    const error = new Error("OpenAI response did not include text output.");
    error.statusCode = 502;
    error.code = "empty_model_output";
    throw error;
  }

  let analysis;
  try {
    analysis = JSON.parse(outputText);
  } catch {
    const error = new Error("OpenAI response was not valid JSON.");
    error.statusCode = 502;
    error.code = "invalid_model_json";
    throw error;
  }

  return {
    analysis: normalizeAnalysis(analysis, normalized),
    model,
    imageCount: normalized.images.length,
  };
}

function normalizePayload(payload = {}) {
  const record = payload.record || {};
  const profile = payload.profile || {};
  const images = Array.isArray(payload.images) ? payload.images : [];
  const safeImages = images
    .filter((image) => image?.dataUrl && /^data:image\/(png|jpeg|jpg|webp);base64,/i.test(image.dataUrl))
    .filter((image) => image.dataUrl.length <= MAX_IMAGE_DATA_URL_LENGTH)
    .slice(0, MAX_IMAGES)
    .map((image) => ({
      name: String(image.name || "image").slice(0, 120),
      type: String(image.type || "image/jpeg").slice(0, 80),
      dataUrl: image.dataUrl,
    }));

  if (!safeImages.length && !String(record.story || record.title || "").trim()) {
    const error = new Error("Please provide at least one image or text story.");
    error.statusCode = 400;
    error.code = "empty_record";
    throw error;
  }

  return {
    profile: {
      childName: String(profile.childName || "孩子").slice(0, 40),
      age: String(profile.age || "").slice(0, 40),
      focus: String(profile.focus || "").slice(0, 80),
      familyName: String(profile.familyName || "").slice(0, 80),
    },
    record: {
      title: String(record.title || "").slice(0, 120),
      story: String(record.story || "").slice(0, 1200),
      recordDate: String(record.recordDate || "").slice(0, 40),
      source: String(record.source || "家人").slice(0, 40),
      scene: sceneNames.includes(record.scene) ? record.scene : "家庭",
      mood: moodNames.includes(record.mood) ? record.mood : "开心",
    },
    images: safeImages,
  };
}

function buildUserContent(payload) {
  const context = {
    childProfile: payload.profile,
    recordDraft: payload.record,
    requiredStyle: {
      title: "12 字以内，像成长记录标题，不要夸张营销",
      story: "120-220 字，描述图片/文字中可观察到的具体片段",
      summary: "80-140 字，解释这条记录呈现的成长信号",
      highlight: "一句话说明这是新信号或持续信号",
      dimensions: "0-6 的分数，越高代表该维度越明显",
      companion: "父母问题、家庭行动、祖辈鼓励都要可直接使用",
    },
  };

  return [
    {
      type: "input_text",
      text: `请分析这条儿童成长记录，返回符合 schema 的 JSON。\n${JSON.stringify(context, null, 2)}`,
    },
    ...payload.images.map((image) => ({
      type: "input_image",
      image_url: image.dataUrl,
      detail: "low",
    })),
  ];
}

function extractOutputText(responseBody) {
  if (typeof responseBody.output_text === "string") return responseBody.output_text;
  const chunks = [];
  for (const outputItem of responseBody.output || []) {
    for (const contentItem of outputItem.content || []) {
      if (typeof contentItem.text === "string") chunks.push(contentItem.text);
      if (typeof contentItem.content === "string") chunks.push(contentItem.content);
    }
  }
  return chunks.join("").trim();
}

function normalizeAnalysis(analysis, payload) {
  const dimensions = Object.fromEntries(
    dimensionNames.map((name) => [name, clampNumber(analysis.dimensions?.[name], 0, 6)]),
  );
  const leadingDimension = dimensionNames.includes(analysis.leadingDimension)
    ? analysis.leadingDimension
    : Object.entries(dimensions).sort((a, b) => b[1] - a[1])[0]?.[0] || "亲子枝";
  const tags = Array.isArray(analysis.tags)
    ? analysis.tags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 6)
    : ["成长观察"];

  return {
    title: firstText(analysis.title, payload.record.title, "新的成长记录"),
    story: firstText(analysis.story, payload.record.story, "这是一条值得被记录的成长片段。"),
    scene: sceneNames.includes(analysis.scene) ? analysis.scene : payload.record.scene,
    mood: moodNames.includes(analysis.mood) ? analysis.mood : payload.record.mood,
    tags: tags.length ? tags : ["成长观察"],
    dimensions,
    leadingDimension,
    confidence: clampNumber(analysis.confidence, 0.45, 0.95),
    summary: firstText(analysis.summary, "这条记录呈现了一个具体的成长信号。"),
    highlight: firstText(analysis.highlight, "这个片段值得继续温柔观察。"),
    cardTitle: firstText(analysis.cardTitle, `${payload.profile.childName}的成长时刻`),
    bookLine: firstText(analysis.bookLine, "这一页会被放入生命之书。"),
    visualDescription: firstText(analysis.visualDescription, ""),
    companion: {
      parentQuestion: firstText(analysis.companion?.parentQuestion, `可以问${payload.profile.childName}：“你最想让我记住哪一刻？”`),
      action: firstText(analysis.companion?.action, "和孩子一起给这条记录取一个家庭小标题。"),
      grandparentLine: firstText(analysis.companion?.grandparentLine, "宝贝，我们看见了你的成长，也很为你开心。"),
    },
    source: "openai-vision",
  };
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value || "").trim();
    if (text) return text;
  }
  return "";
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.min(max, Math.max(min, number));
}

module.exports = {
  analyzeGrowthRecord,
  dimensionNames,
};

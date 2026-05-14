const { analyzeGrowthRecord } = require("../server/ai-analysis.cjs");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: { code: "method_not_allowed", message: "Use POST." } });
    return;
  }

  try {
    const result = await analyzeGrowthRecord(request.body || {});
    response.status(200).json(result);
  } catch (error) {
    response.status(error.statusCode || 500).json({
      error: {
        code: error.code || "analysis_failed",
        message: error.message || "Analysis failed.",
      },
    });
  }
};

module.exports.config = {
  api: {
    bodyParser: {
      sizeLimit: "8mb",
    },
  },
};

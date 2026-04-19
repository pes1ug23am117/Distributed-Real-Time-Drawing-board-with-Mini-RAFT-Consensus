// Message protocol helpers for validating and constructing websocket payloads.

function safeParseJson(raw) {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (_err) {
    return { ok: false, error: "invalid_json" };
  }
}

function validateStrokeMessage(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "message_must_be_object" };
  }

  if (payload.type !== "stroke") {
    return { ok: false, error: "unsupported_message_type" };
  }

  const data = payload.data;
  if (!data || typeof data !== "object") {
    return { ok: false, error: "missing_data" };
  }

  // Legacy/simple shape from current frontend: x0,y0,x1,y1,color,size
  const hasLegacyCoordinates =
    typeof data.x0 === "number" &&
    typeof data.y0 === "number" &&
    typeof data.x1 === "number" &&
    typeof data.y1 === "number";
  if (hasLegacyCoordinates && typeof data.color === "string" && typeof data.size === "number") {
    const strokeId =
      typeof data.id === "string" && data.id.trim().length > 0
        ? data.id
        : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    return {
      ok: true,
      stroke: {
        id: strokeId,
        x0: data.x0,
        y0: data.y0,
        x1: data.x1,
        y1: data.y1,
        color: data.color,
        size: data.size,
      },
    };
  }

  const hasStrokeId = typeof data.strokeId === "string" && data.strokeId.trim().length > 0;
  const hasPoints = Array.isArray(data.points);
  const hasColor = typeof data.color === "string";
  const hasThickness = typeof data.thickness === "number";

  if (!hasStrokeId || !hasPoints || !hasColor || !hasThickness) {
    return { ok: false, error: "invalid_stroke_payload" };
  }

  return {
    ok: true,
    stroke: {
      id: data.strokeId,
      points: data.points,
      color: data.color,
      thickness: data.thickness,
    },
  };
}

function createStrokeCommitMessage(stroke) {
  return JSON.stringify({
    type: "stroke",
    data: stroke,
  });
}

function createErrorMessage(code, details) {
  return JSON.stringify({
    type: "error",
    error: {
      code,
      details,
    },
  });
}

module.exports = {
  safeParseJson,
  validateStrokeMessage,
  createStrokeCommitMessage,
  createErrorMessage,
};

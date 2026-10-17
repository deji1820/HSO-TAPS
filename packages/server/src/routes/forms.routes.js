import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { FormPipeline, SyncLog } from "../models/FormPipeline.js";
import { handleFormSubmission } from "../services/formsSync.service.js";

const router = Router();

// Power Automate calls this on every new form response. Secure with a
// webhook secret query param or header in production (not shown here).
router.post("/webhook/:pipelineId", async (req, res) => {
  const pipeline = await FormPipeline.findOne({ pipelineId: req.params.pipelineId });
  const result = await handleFormSubmission({
    pipelineId: req.params.pipelineId,
    formName: pipeline?.documentTitle || req.params.pipelineId,
    payload: req.body,
  });
  if (pipeline) await FormPipeline.updateOne({ _id: pipeline._id }, { lastSyncedAt: new Date() });
  res.json(result);
});

router.get("/", requireAuth, requireRole("superadmin"), async (_req, res) => {
  res.json(await FormPipeline.find());
});

router.get("/sync-log", requireAuth, requireRole("superadmin"), async (_req, res) => {
  res.json(await SyncLog.find().sort({ createdAt: -1 }).limit(100));
});

export default router;

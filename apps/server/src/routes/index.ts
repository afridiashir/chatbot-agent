import { Router } from "express";
import { adminRouter } from "./admin.js";
import { agentsRouter } from "./agents.js";
import { authRouter } from "./auth.js";
import { branchesRouter } from "./branches.js";
import { conversationsRouter } from "./conversations.js";
import { conversationLabelsRouter, labelsRouter } from "./labels.js";
import { avatarsRouter } from "./avatars.js";
import { mediaRouter } from "./media.js";
import { pushRouter } from "./push.js";

export const apiRouter: Router = Router();

apiRouter.use("/admin", adminRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/branches", branchesRouter);
apiRouter.use("/agents", agentsRouter);
apiRouter.use("/conversations", conversationsRouter);
apiRouter.use("/conversations", conversationLabelsRouter);
apiRouter.use("/labels", labelsRouter);
apiRouter.use("/media", mediaRouter);
apiRouter.use("/push", pushRouter);
apiRouter.use("/avatars", avatarsRouter);

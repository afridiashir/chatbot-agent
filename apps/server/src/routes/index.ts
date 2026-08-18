import { Router } from "express";
import { adminRouter } from "./admin.js";
import { agentsRouter } from "./agents.js";
import { authRouter } from "./auth.js";
import { branchesRouter } from "./branches.js";
import { conversationsRouter } from "./conversations.js";

export const apiRouter: Router = Router();

apiRouter.use("/admin", adminRouter);
apiRouter.use("/auth", authRouter);
apiRouter.use("/branches", branchesRouter);
apiRouter.use("/agents", agentsRouter);
apiRouter.use("/conversations", conversationsRouter);

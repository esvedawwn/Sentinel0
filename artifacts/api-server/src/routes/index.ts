import { Router, type IRouter } from "express";
import healthRouter from "./health";
import dashboardRouter from "./dashboard";
import scansRouter from "./scans";
import filesRouter from "./files";
import duplicatesRouter from "./duplicates";
import categoriesRouter from "./categories";
import activityRouter from "./activity";
import reportsRouter from "./reports";
import findingsRouter from "./findings";
import aiRouter from "./ai";
import scanRootsRouter from "./scanRoots";
import searchRouter from "./search";
import actionQueueRouter from "./actionQueue";
import settingsRouter from "./settings";
import extractionRouter from "./extraction";

const router: IRouter = Router();

router.use(healthRouter);
router.use(dashboardRouter);
router.use(scansRouter);
router.use(filesRouter);
router.use(duplicatesRouter);
router.use(categoriesRouter);
router.use(activityRouter);
router.use(reportsRouter);
router.use(findingsRouter);
router.use(aiRouter);
router.use(scanRootsRouter);
router.use(searchRouter);
router.use(actionQueueRouter);
router.use(settingsRouter);
router.use(extractionRouter);

export default router;

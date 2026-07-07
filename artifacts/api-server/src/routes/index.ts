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

export default router;

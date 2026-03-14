import { Router } from "express";
import { getAllCmGroups } from "../db/queries.js";

const router = Router();

router.get("/", (_req, res) => {
  const groups = getAllCmGroups();
  res.json(groups);
});

export default router;

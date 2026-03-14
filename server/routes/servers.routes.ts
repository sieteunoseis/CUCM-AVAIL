import { Router } from "express";
import { getAllServers } from "../db/queries.js";

const router = Router();

router.get("/", (_req, res) => {
  const servers = getAllServers();
  res.json(servers);
});

export default router;

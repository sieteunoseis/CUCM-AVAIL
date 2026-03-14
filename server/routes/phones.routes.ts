import { Router } from "express";
import { getAllPhones, getPhoneCount } from "../db/queries.js";

const router = Router();

router.get("/", (req, res) => {
  const limit = parseInt(req.query.limit as string) || 100;
  const offset = parseInt(req.query.offset as string) || 0;
  const phones = getAllPhones(limit, offset);
  const total = getPhoneCount();
  res.json({ phones, total, limit, offset });
});

export default router;

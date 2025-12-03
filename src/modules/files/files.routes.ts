import { Router } from "express";
import {
  uploadFile,
  getEntityFiles,
  getFile,
  deleteFile,
  upload,
} from "./files.controller";
import { authRequired } from "../../middleware/auth";

const router = Router();

// Upload file (with multer middleware)
router.post("/upload", authRequired, upload.single("file"), uploadFile);

// Get all files for an entity
router.get("/:entityType/:entityId", authRequired, getEntityFiles);

// Get specific file
router.get("/:id", authRequired, getFile);

// Delete file
router.delete("/:id", authRequired, deleteFile);

export default router;

// routes/upload.js
const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
require("dotenv").config({ path: ".env" }); // ensure env variables are loaded

const router = express.Router();

// Multer setup: memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Cloudflare R2 client (S3-compatible)
const s3 = new AWS.S3({
  endpoint: new AWS.Endpoint(process.env.R2_ENDPOINT),
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  signatureVersion: "v4",
  region: "auto",
});

// POST /api/upload - handle multiple file uploads
router.post("/", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedFiles = [];

    // Upload each file to R2
    for (let file of req.files) {
      const key = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;

      const params = {
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: "public-read", // optional, if bucket is public
      };

      await s3.upload(params).promise();

      uploadedFiles.push({
        originalName: file.originalname,
        url: `${process.env.R2_ENDPOINT}/${process.env.R2_BUCKET_NAME}/${key}`,
      });
    }

    res.json({ message: "Files uploaded successfully!", files: uploadedFiles });
  } catch (err) {
    console.error("R2 upload error:", err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

module.exports = router;

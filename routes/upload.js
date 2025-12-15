// routes/upload.js
const express = require("express");
const multer = require("multer");
const AWS = require("aws-sdk");
const sharp = require("sharp");
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

// Image size configurations for responsive images
const IMAGE_SIZES = {
  thumb: { width: 200, height: 200, suffix: '-thumb' },
  medium: { width: 600, height: 600, suffix: '-medium' },
  large: { width: 1200, height: 1200, suffix: '-large' }
};

// Helper function to upload a buffer to R2
const uploadToR2 = async (buffer, key, contentType) => {
  const params = {
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
    ACL: "public-read",
  };
  await s3.upload(params).promise();
};

// Helper function to generate optimized image variants
const generateImageVariants = async (buffer, baseKey) => {
  const variants = {};
  
  // Remove extension from baseKey for variant naming
  const keyWithoutExt = baseKey.replace(/\.[^/.]+$/, '');
  
  for (const [sizeName, config] of Object.entries(IMAGE_SIZES)) {
    try {
      // Generate WebP version (smaller, modern format)
      const webpBuffer = await sharp(buffer)
        .resize(config.width, config.height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toBuffer();
      
      const webpKey = `${keyWithoutExt}${config.suffix}.webp`;
      await uploadToR2(webpBuffer, webpKey, 'image/webp');
      variants[`${sizeName}_webp`] = webpKey;
      
      // Generate JPEG fallback for older browsers
      const jpegBuffer = await sharp(buffer)
        .resize(config.width, config.height, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ quality: 80 })
        .toBuffer();
      
      const jpegKey = `${keyWithoutExt}${config.suffix}.jpg`;
      await uploadToR2(jpegBuffer, jpegKey, 'image/jpeg');
      variants[`${sizeName}_jpeg`] = jpegKey;
      
    } catch (err) {
      console.error(`❌ Failed to generate ${sizeName} variant:`, err.message);
    }
  }
  
  return variants;
};

// POST /api/upload - handle multiple file uploads
router.post("/", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedFiles = [];

    // Upload each file to R2
    for (let file of req.files) {
      let fileBuffer = file.buffer;
      let contentType = file.mimetype;
      const baseKey = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;

      // Process images with Sharp
      if (file.mimetype.startsWith('image/')) {
        try {
          // Generate responsive image variants (thumb, medium, large in WebP + JPEG)
          const variants = await generateImageVariants(file.buffer, baseKey);
          
          // Also upload the original as large WebP (main file)
          const mainBuffer = await sharp(file.buffer)
            .resize(1200, 1200, { 
              fit: 'inside', 
              withoutEnlargement: true 
            })
            .webp({ quality: 85 })
            .toBuffer();
          
          const mainKey = baseKey.replace(/\.[^/.]+$/, '') + '.webp';
          await uploadToR2(mainBuffer, mainKey, 'image/webp');
          
          uploadedFiles.push({
            originalName: file.originalname,
            url: mainKey,
            variants: variants, // Include variant URLs for responsive loading
          });
          
        } catch (err) {
          console.error('❌ Sharp processing failed, uploading original:', err.message);
          // Fallback: upload original file
          await uploadToR2(fileBuffer, baseKey, contentType);
          uploadedFiles.push({
            originalName: file.originalname,
            url: baseKey,
          });
        }
      } else {
        // Non-image files: upload as-is
        await uploadToR2(fileBuffer, baseKey, contentType);
        uploadedFiles.push({
          originalName: file.originalname,
          url: baseKey,
        });
      }
    }

    res.json({ message: "Files uploaded successfully!", files: uploadedFiles });
  } catch (err) {
    console.error("R2 upload error:", err);
    res.status(500).json({ error: "Upload failed", details: err.message });
  }
});

module.exports = router;

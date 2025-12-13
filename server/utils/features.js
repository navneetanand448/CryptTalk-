import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { v4 as uuid } from "uuid";
import { v2 as cloudinary } from "cloudinary";
import { getBase64, getSockets } from "../lib/helper.js";
const cookieOptions = {
  maxAge: 15 * 24 * 60 * 60 * 1000, //15days
  sameSite: "lax",
  httpOnly: true,
  secure: false,
};

// Function to clear all collections in the database
// const clearDatabase = async () => {
//   try {
//     const collections = await mongoose.connection.db.listCollections().toArray();
    
//     for (const collection of collections) {
//       await mongoose.connection.db.collection(collection.name).deleteMany({});
//       console.log(`Cleared collection: ${collection.name}`);
//     }
    
//     console.log("✅ Database cleared successfully");
//   } catch (error) {
//     console.error("❌ Error clearing database:", error);
//   }
// };

const connectDB = async (uri) => {
  try {
    const data = await mongoose.connect(uri, { dbName: "CryptTalk" });
    console.log(`connected to DB:${data.connection.host}`);
    
    // Clear database on startup
    // console.log("🧹 Clearing database on startup...");
    // await clearDatabase();
    
  } catch (err) {
    console.error("❌ Database connection error:", err);
    throw err;
  }
};

const sendToken = (res, user, code, message) => {
  const token = jwt.sign(
    {
      _id: user._id,
    },
    process.env.JWT_SECRET
  );

  return res.status(code).cookie("ChatCrypt-token", token, cookieOptions).json({
    success: true,
    user,
    message,
  });
};

const emitEvent = (req, event, users, data) => {
  const io = req.app.get("io");
  const usersSocket = getSockets(users);
  io.to(usersSocket).emit(event, data);
};

const uploadFilesToCloudinary = async (files = []) => {
  const uploadPromises = files.map((file) => {
    return new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        getBase64(file),
        {
          resource_type: "auto",
          public_id: uuid(),
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
    });
  });
  try {
    const results = await Promise.all(uploadPromises);

    const formattedResults = results.map((result) => ({
      public_id: result.public_id,
      url: result.url,
    }));
    return formattedResults;
  } catch (err) {
    throw new Error("Error uploading files to cloudinary", err);
  }
};

const deleteFilesFromCloudinary = async (public_ids) => {
  //delete files
};

export {
  connectDB,
  sendToken,
  cookieOptions,
  emitEvent,
  deleteFilesFromCloudinary,
  uploadFilesToCloudinary,
};

import { v4 as uuidv4 } from 'uuid';
import ImageKit from "imagekit";
import config from "../config/_config.js";

const imagekit = new ImageKit({
    publicKey: config.imagekit_public_key,
    privateKey: config.imagekit_private_key,
    urlEndpoint: config.imagekit_url_endpoint,
});

const uploadImage = async (fileBuffer, filename) => {
    try {
        const uniqueFilename = `${uuidv4()}-${filename}`;
        const result = await imagekit.upload({
            file: fileBuffer.toString("base64"),
            fileName: uniqueFilename,
            folder: "colearn/auth/avatars",
        });
        return result;
    } catch (error) {
        console.error("ImageKit Upload Failed with Error:", error);

        const errorMessage = error.message
            ? error.message
            : typeof error === "object" && error !== null
                ? JSON.stringify(error)
                : "Unknown ImageKit API Error";

        throw new Error(`Failed to upload image to ImageKit: ${errorMessage}`);
    }
};

export { uploadImage };
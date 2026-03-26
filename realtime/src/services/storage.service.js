import ImageKit from "imagekit";
import config from "../config/_config.js";

const imagekit = new ImageKit({
    publicKey: config.imagekit_public_key,
    privateKey: config.imagekit_private_key,
    urlEndpoint: config.imagekit_url_endpoint,
});

export const uploadFile = async (fileBuffer, fileName) => {
    try {
        const result = await imagekit.upload({
            file: fileBuffer,
            fileName: fileName,
            useUniqueFileName: true,
        });
        return result.url;
    } catch (error) {
        console.error("Realtime service: ImageKit upload error:", error);
        throw new Error("Failed to upload file to ImageKit");
    }
};

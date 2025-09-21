/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { GoogleGenAI, GenerateContentResponse, Modality } from "@google/genai";

const fileToPart = async (file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = error => reject(error);
    });
    const { mimeType, data } = dataUrlToParts(dataUrl);
    return { inlineData: { mimeType, data } };
};

const dataUrlToParts = (dataUrl: string) => {
    const arr = dataUrl.split(',');
    if (arr.length < 2) throw new Error("Invalid data URL");
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch || !mimeMatch[1]) throw new Error("Could not parse MIME type from data URL");
    return { mimeType: mimeMatch[1], data: arr[1] };
}

const dataUrlToPart = (dataUrl: string) => {
    const { mimeType, data } = dataUrlToParts(dataUrl);
    return { inlineData: { mimeType, data } };
}

const handleApiResponse = (response: GenerateContentResponse): string => {
    if (response.promptFeedback?.blockReason) {
        const { blockReason, blockReasonMessage } = response.promptFeedback;
        const errorMessage = `Request was blocked. Reason: ${blockReason}. ${blockReasonMessage || ''}`;
        throw new Error(errorMessage);
    }

    // Find the first image part in any candidate
    for (const candidate of response.candidates ?? []) {
        const imagePart = candidate.content?.parts?.find(part => part.inlineData);
        if (imagePart?.inlineData) {
            const { mimeType, data } = imagePart.inlineData;
            return `data:${mimeType};base64,${data}`;
        }
    }

    const finishReason = response.candidates?.[0]?.finishReason;
    if (finishReason && finishReason !== 'STOP') {
        const errorMessage = `Image generation stopped unexpectedly. Reason: ${finishReason}. This often relates to safety settings.`;
        throw new Error(errorMessage);
    }
    const textFeedback = response.text?.trim();
    const errorMessage = `The AI model did not return an image. ` + (textFeedback ? `The model responded with text: "${textFeedback}"` : "This can happen due to safety filters or if the request is too complex. Please try a different image.");
    throw new Error(errorMessage);
};

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
const model = 'gemini-2.5-flash-image-preview';

export const generateModelImage = async (userImage: File): Promise<string> => {
    const userImagePart = await fileToPart(userImage);
    const prompt = "You are an expert portrait photographer AI. Transform the person in this image into a professional-looking AI avatar. The background must be a clean, neutral studio backdrop (light gray, #f0f0f0). The person should have a neutral, professional expression suitable for a headshot. Preserve the person's identity, unique features, and body type. Ensure the final image is photorealistic and high-quality. Return ONLY the final image.";
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [userImagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    return handleApiResponse(response);
};

export const generateVirtualTryOnImage = async (modelImageUrl: string, garmentImage: File): Promise<string> => {
    const modelImagePart = dataUrlToPart(modelImageUrl);
    const garmentImagePart = await fileToPart(garmentImage);
    const prompt = `You are an expert AI portrait studio assistant. You will be given a 'base portrait' (the 'model image') and a 'style image' (the 'garment image'). Your task is to create a new photorealistic portrait where the person from the 'base portrait' is wearing the clothing item from the 'style image'.

**Crucial Rules:**
1.  **Complete Style Application:** You MUST completely REMOVE and REPLACE the corresponding clothing item worn by the person in the 'base portrait' with the new item from the 'style image'. No part of the original clothing (e.g., collars, sleeves, patterns) should be visible.
2.  **Preserve the Person:** The person's face, hair, body shape, and pose from the 'base portrait' MUST remain unchanged.
3.  **Preserve the Background:** The entire background from the 'base portrait' MUST be preserved perfectly.
4.  **Apply the Garment:** Realistically fit the new garment onto the person. It should adapt to their pose with natural folds, shadows, and lighting consistent with the original scene.
5.  **Output:** Return ONLY the final, edited portrait. Do not include any text.`;
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [modelImagePart, garmentImagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    return handleApiResponse(response);
};

export const generatePoseVariation = async (tryOnImageUrl: string, poseInstruction: string): Promise<string> => {
    const tryOnImagePart = dataUrlToPart(tryOnImageUrl);
    const prompt = `You are an expert AI portrait photographer. Take this portrait and regenerate it from a different perspective. The person, their clothing, and the background style must remain identical. The new perspective should be: "${poseInstruction}". Return ONLY the final image.`;
    const response = await ai.models.generateContent({
        model,
        contents: { parts: [tryOnImagePart, { text: prompt }] },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    return handleApiResponse(response);
};

export const adjustImage = async (baseImageUrl: string, instruction: string, sceneImage: File | null): Promise<string> => {
    const baseImagePart = dataUrlToPart(baseImageUrl);
    
    const parts: any[] = [baseImagePart];
    if (sceneImage) {
        const sceneImagePart = await fileToPart(sceneImage);
        parts.push(sceneImagePart);
    }

    const systemPrompt = `You are an expert AI photo editor. You will receive a 'base image', a text 'instruction', and an optional 'scene image'. Your task is to edit the 'base image' according to the 'instruction'. If a 'scene image' is provided, use it as a reference for the background, style, or objects to be added.

**Rules:**
1.  **Follow Instructions:** Precisely follow the text 'instruction' to modify the 'base image'. This could involve changing the background, adding or removing objects, changing pose, adjusting lighting, etc.
2.  **Preserve Identity:** The person's identity, face, and essential features must be preserved unless the instruction explicitly asks to change them (e.g., 'add glasses').
3.  **Use Scene Image (if provided):** If a 'scene image' is included, incorporate it into the final result as instructed (e.g., as a new background).
4.  **Seamless Integration:** Edits must be photorealistic and seamlessly blended with the original image.
5.  **Output:** Return ONLY the final, edited image. Do not add any text.`;
    
    const fullPrompt = `${systemPrompt}\n\nInstruction: "${instruction}"`;
    parts.push({ text: fullPrompt });

    const response = await ai.models.generateContent({
        model,
        contents: { parts },
        config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
    });
    return handleApiResponse(response);
};
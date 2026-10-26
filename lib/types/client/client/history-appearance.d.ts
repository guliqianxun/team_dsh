export type PetAppearance = {
    kind: 'whale' | 'cat' | 'custom';
    image: string | null;
};
export type AppearanceError = 'load' | 'save' | 'size' | 'format' | 'decode';
/** Read only this plugin's preference, retaining an error when browser storage is unavailable. */
export declare function readAppearance(): {
    value: PetAppearance;
    error: AppearanceError | null;
};
/** Save before changing the displayed choice so storage failures keep the old appearance. */
export declare function saveAppearance(value: PetAppearance): boolean;
/** Validate upload size, encoding and browser decoding before it can replace a saved image. */
export declare function readPetImage(file: File): Promise<{
    image: string;
} | {
    error: AppearanceError;
}>;

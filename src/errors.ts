/* Erorile pe care API-ul le întoarce ca JSON: { error: "cod", message: "text pentru oameni" }. */
export class ApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
        super(message);
    }
}
export const badRequest = (code: string, message: string) => new ApiError(400, code, message);
export const unauthorized = (message = "Trebuie să fii autentificat.") => new ApiError(401, "unauthorized", message);
export const forbidden = (message = "Nu ai voie să faci asta.") => new ApiError(403, "forbidden", message);
export const notFound = (message = "Nu există.") => new ApiError(404, "not_found", message);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);

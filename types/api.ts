// Standard Laravel API envelope
export interface ApiResponse<T> {
    data: T;
    message?: string;
}

// Laravel pagination (Resource::collection)
export interface PaginationMeta {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
}

export interface PaginationLinks {
    first: string | null;
    last: string | null;
    prev: string | null;
    next: string | null;
}

export interface PaginatedResponse<T> {
    data: T[];
    meta: PaginationMeta;
    links: PaginationLinks;
}

// Validation error shape (422)
export interface ValidationErrors {
    [field: string]: string[];
}

// Shape of every error response from the API
export interface ApiError {
    message: string;
    errors?: ValidationErrors;
}

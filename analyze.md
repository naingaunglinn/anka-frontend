# ANKA Agency Platform - Backend API Implementation Guide

This document is designed as a direct prompt and reference guide for a Backend Developer (or AI) to build the Laravel API for the ANKA Agency Platform. It is based on the frontend's data fetching patterns, state management (`store/businessStore.ts`), mapping logic (`lib/dealsMapper.ts`), and the canonical PostgreSQL schema (`ANKA.sql`).

## 1. System Architecture

*   **Frontend**: Next.js 16 App Router, React 19, Zustand, Tailwind CSS 4.
*   **Backend**: Laravel (API only).
*   **Database**: PostgreSQL 15+ (using Supabase).
*   **Authentication**: Laravel Sanctum. The frontend expects `GET /sanctum/csrf-cookie` and uses a `Bearer <token>` inside `lib/api.ts` or cookie-based sessions.
*   **Multi-tenancy**: Every request to the `api.ts` client passes an `X-Tenant-ID: <uuid>` header. The backend **must** scope all queries, creations, and updates to the active tenant. A global scope on Eloquent models is highly recommended.

## 2. Database Schema Highlights (`ANKA.sql`)

The `ANKA.sql` file defines the PostgreSQL schema. Key things to remember:
*   **Tenants**: Everything belongs to a `tenant_id`.
*   **UUIDs**: Most primary keys are `uuid` (`gen_random_uuid()`).
*   **Generated Columns**: 
    *   `employees.cost_per_hour` is automatically generated (`monthly_salary / workable_hours`).
    *   `invoices.total` is automatically generated (`amount + tax`).
*   **Sequences**: Contracts (`CON-0001`), Invoices (`INV-1042`), and Projects (`PRJ-101`) use PostgreSQL sequences to auto-generate readable IDs.
*   **`win_deal` Function**: A stored procedure (`win_deal(p_deal_id, p_tenant_id)`) handles the atomic conversion of a `Deal` into a `Contract` and `Project`. The backend should call this function rather than manually creating the related records.

## 3. Required API Endpoints

The Next.js frontend expects the following endpoints. Data is mostly serialized in `snake_case` from the API and mapped to `camelCase` on the frontend via `dealsMapper.ts`.

### 3.1 Authentication
*   `GET /auth/me`
    *   **Description**: Fetch the currently authenticated user.
    *   **Response**: Must include user details, `app_role` (Admin, Executive, Sales, Delivery, HR), and `tenant_id`.

### 3.2 CRM & Deals Pipeline
*   `GET /deals`
    *   **Description**: Fetch all deals for the active tenant.
    *   **Response**: Array of Deal objects (including nested `ghost_roles`, `hard_assignments`, `estimation_resources`, and `deal_overheads`).

*   `POST /deals`
    *   **Payload**: `{ name, client, estimated_value, win_probability, status, ... }`
    *   **Response**: The created Deal object.

*   `PUT /deals/{id}`
    *   **Payload**: Any subset of Deal fields to update (e.g., updating estimations, margins, costs).
    *   **Response**: The updated Deal object.

*   `PATCH /deals/{id}/stage`
    *   **Payload**: `{ status: string, win_probability: number }`
    *   **Description**: Updates a deal's position on the Kanban board.
    *   **Response**: The updated Deal object.

*   `POST /deals/{id}/win`
    *   **Description**: Marks a deal as Won. The backend **must** call the `win_deal()` stored procedure or implement its exact logic to atomically generate a Contract and Project.
    *   **Response**: `{ deal, contract, project }` (Returns the updated deal, and newly created contract/project).

*   `DELETE /deals/{id}`
    *   **Description**: Soft deletes the deal.

### 3.3 Contracts, Milestones & Billing
*   `GET /contracts`
    *   **Description**: Fetch all contracts for the tenant.
    *   **Response**: Array of Contract objects.

*   `GET /invoices`
    *   **Description**: Fetch all invoices for the tenant.
    *   **Response**: Array of Invoice objects.

*   `POST /invoices`
    *   **Payload**: `{ contract_id, issue_date, due_date, amount, tax, status, notes }`
    *   **Description**: Creates a new invoice. Note: `total` is auto-calculated by Postgres.
    *   **Response**: The created Invoice object.

*   `PATCH /invoices/{id}/pay`
    *   **Description**: Marks an invoice as Paid. 
    *   **Backend Logic**: Must also update `contracts.revenue_recognized` by adding the invoice's `total` to it.
    *   **Response**: The updated Invoice object.

### 3.4 Projects & Time Tracking
*   `GET /projects`
    *   **Description**: Fetch all projects for the tenant.
    *   **Response**: Array of Project objects.

*   `GET /time-entries`
    *   **Description**: Fetch time entries.
    *   **Response**: Array of TimeEntry objects.

*   `POST /time-entries`
    *   **Payload**: `{ project_id, employee_id, task, date, hours, billable }`
    *   **Description**: Creates a time entry (defaults to `status: 'Draft'` or `Pending` depending on backend rules).
    *   **Response**: The created TimeEntry object.

*   `PATCH /time-entries/{id}/approve` *(Future Requirement)*
    *   **Description**: Approves a pending time entry.
    *   **Backend Logic**: Must safely increment `projects.consumed_hours` by the entry's `hours` value EXACTLY ONCE to avoid double-counting.

## 4. Implementation Constraints & Best Practices

1.  **Response Wrapper**: The frontend often uses `(data.data ?? data)` to handle API responses. Using Laravel's default JSON API resources (`return new DealResource($deal);`) which wraps responses in a `data` key is perfectly compatible.
2.  **Date Formatting**: Ensure dates (`issue_date`, `due_date`, `date`) are returned as ISO strings (e.g., `YYYY-MM-DD`).
3.  **Numbers**: Ensure numeric fields (`amount`, `tax`, `total`, `hours`) are correctly cast to numbers/decimals in Laravel to avoid floating-point errors, though the frontend `dealsMapper.ts` casts them using `Number()` as a safety fallback.
4.  **Error Handling**: Standard Laravel Validation errors (422) with a `message` field are parsed by the frontend's Zustand store error handlers. Include meaningful error messages in the `message` key.

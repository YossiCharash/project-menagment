-- Task Management Calendar: employees and tasks tables
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    color VARCHAR(20),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_employees_id ON employees(id);
CREATE INDEX IF NOT EXISTS ix_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS ix_employees_is_active ON employees(is_active);

CREATE TABLE IF NOT EXISTS tasks (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    description TEXT,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    unique_tag VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tasks_id ON tasks(id);
CREATE INDEX IF NOT EXISTS ix_tasks_title ON tasks(title);
CREATE INDEX IF NOT EXISTS ix_tasks_start_time ON tasks(start_time);
CREATE INDEX IF NOT EXISTS ix_tasks_end_time ON tasks(end_time);
CREATE INDEX IF NOT EXISTS ix_tasks_employee_id ON tasks(employee_id);
CREATE INDEX IF NOT EXISTS ix_tasks_unique_tag ON tasks(unique_tag);

CREATE TABLE IF NOT EXISTS task_attachments (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    file_path VARCHAR(512) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    unique_tag VARCHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_task_attachments_id ON task_attachments(id);
CREATE INDEX IF NOT EXISTS ix_task_attachments_task_id ON task_attachments(task_id);
CREATE INDEX IF NOT EXISTS ix_task_attachments_unique_tag ON task_attachments(unique_tag);

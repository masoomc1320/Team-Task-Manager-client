import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';

type AuthUser = { id: number; name: string; email: string; role: 'admin' | 'member' };
type AuthState = { token: string; user: AuthUser };
type Project = { _id: number; name: string; description: string; members: { _id: number; name: string; email: string; role: string }[] };
type Task = {
  _id: number;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done';
  dueDate: string;
  project: { _id: number; name: string };
  assignedTo: { _id: number; name: string; email: string };
};

@Component({
  selector: 'app-root',
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  apiBase = (window as any).__API_URL__ || 'http://localhost:5000/api';
  mode: 'login' | 'signup' = 'login';
  auth: AuthState | null = this.readAuth();
  error = '';
  dashboard: any = null;
  projects: Project[] = [];
  tasks: Task[] = [];

  form = { name: '', email: '', password: '', role: 'member' };
  projectForm = { name: '', description: '' };
  memberForm: { projectId: number | ''; email: string } = {
    projectId: '',
    email: ''
  };
  taskForm = { title: '', description: '', dueDate: '', assignedTo: '', projectId: '' };

  ngOnInit() {
    if (this.auth?.token) {
      this.loadAll();
    }
  }

  get user() {
    return this.auth?.user;
  }

  get token() {
    return this.auth?.token ?? '';
  }

  async request(path: string, options: RequestInit = {}) {
    const res = await fetch(`${this.apiBase}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      },
      ...options
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Request failed');
    }
    return data;
  }

  async loadAll() {
    this.error = '';
    const errs: string[] = [];
    try {
      this.dashboard = await this.request('/dashboard');
    } catch (e: any) {
      errs.push(e.message);
      this.dashboard = null;
    }
    try {
      const raw = await this.request('/projects');
      this.projects = Array.isArray(raw) ? raw : [];
    } catch (e: any) {
      errs.push(e.message);
      this.projects = [];
    }
    try {
      const raw = await this.request('/tasks');
      this.tasks = Array.isArray(raw) ? raw : [];
    } catch (e: any) {
      errs.push(e.message);
      this.tasks = [];
    }
    if (errs.length) {
      this.error = errs.join(' ');
    }
  }

  /** Assignees for the currently selected project (ids normalized as strings for stable matching). */
  assigneesForSelectedProject(): { id: string; label: string }[] {
    const raw = this.taskForm.projectId;
    if (raw === '' || raw === null || raw === undefined) {
      return [];
    }
    const selectedPid = String(raw);
    return this.projects.flatMap((p) => {
      if (String(p._id) !== selectedPid) {
        return [];
      }
      return (p.members || []).map((m) => ({
        id: String(m._id),
        label: `${m.name} (${m.email})`
      }));
    });
  }

  memberNames(project: Project) {
    return (project.members || []).map((m) => m.name).join(', ');
  }

  async submitAuth() {
    this.error = '';
    try {
      const path = this.mode === 'signup' ? '/auth/signup' : '/auth/login';
      const payload =
        this.mode === 'signup'
          ? this.form
          : { email: this.form.email, password: this.form.password };
      const data = await this.request(path, { method: 'POST', body: JSON.stringify(payload) });
      this.auth = data;
      localStorage.setItem('auth', JSON.stringify(data));
      await this.loadAll();
    } catch (e: any) {
      this.error = e.message;
    }
  }

  async createProject() {
    this.error = '';
    try {
      await this.request('/projects', { method: 'POST', body: JSON.stringify(this.projectForm) });
      this.projectForm = { name: '', description: '' };
      await this.loadAll();
    } catch (e: any) {
      this.error = e.message;
    }
  }

  async addMemberToProject() {
    this.error = '';
    const email = this.memberForm.email?.trim() ?? '';
    const rawPid = this.memberForm.projectId;
    if (rawPid === '' || !email) {
      this.error = 'Choose a project and enter the member’s email (they must sign up first).';
      return;
    }
    const projectIdNum = Number(rawPid);
    if (!Number.isFinite(projectIdNum)) {
      this.error = 'Select a valid project.';
      return;
    }
    try {
      await this.request(`/projects/${projectIdNum}/members/by-email`, {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      this.memberForm.email = '';
      await this.loadAll();
    } catch (e: any) {
      this.error = e.message;
    }
  }

  async createTask() {
    this.error = '';
    const projectId = String(this.taskForm.projectId || '').trim();
    const assignee = String(this.taskForm.assignedTo || '').trim();
    if (!projectId || !assignee || !this.taskForm.dueDate?.trim()) {
      this.error = 'Select a project, assignee, and due date.';
      return;
    }
    const projectIdNum = Number(projectId);
    const assigneeNum = Number(assignee);
    if (!Number.isFinite(projectIdNum) || projectIdNum <= 0) {
      this.error = 'Select a valid project.';
      return;
    }
    if (!Number.isFinite(assigneeNum) || assigneeNum <= 0) {
      this.error = 'Select a valid assignee.';
      return;
    }
    try {
      const payload = {
        title: this.taskForm.title.trim(),
        description: this.taskForm.description?.trim() ?? '',
        dueDate: this.taskForm.dueDate,
        assignedTo: assigneeNum
      };
      await this.request(`/tasks/project/${projectIdNum}`, { method: 'POST', body: JSON.stringify(payload) });
      this.taskForm = { title: '', description: '', dueDate: '', assignedTo: '', projectId: '' };
      await this.loadAll();
    } catch (e: any) {
      this.error = e.message;
    }
  }

  async updateStatus(taskId: number, status: string) {
    this.error = '';
    try {
      await this.request(`/tasks/${taskId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await this.loadAll();
    } catch (e: any) {
      this.error = e.message;
    }
  }

  logout() {
    this.auth = null;
    localStorage.removeItem('auth');
    this.dashboard = null;
    this.projects = [];
    this.tasks = [];
  }

  private readAuth(): AuthState | null {
    const raw = localStorage.getItem('auth');
    return raw ? JSON.parse(raw) : null;
  }
}

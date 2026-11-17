/** Liên kết tài liệu / báo cáo của dự án đang xem (tab Tài liệu và Báo cáo) */
import { create } from 'zustand';
import { api, type ProjectLink } from './api';
import { toast } from '../toast';

interface LinksState {
  projectId: string | null;
  links: ProjectLink[];
  loading: boolean;
  failed: boolean;
}

export const useLinks = create<LinksState>(() => ({ projectId: null, links: [], loading: false, failed: false }));
const set = useLinks.setState;

/** Tải lại danh sách; đổi dự án thì xoá danh sách cũ ngay để không hiện nhầm */
export async function loadLinks(projectId: string | null) {
  if (!projectId) {
    set({ projectId: null, links: [], loading: false, failed: false });
    return;
  }
  const same = useLinks.getState().projectId === projectId;
  set(same ? { loading: true, failed: false } : { projectId, links: [], loading: true, failed: false });
  try {
    const { links } = await api.projectLinks(projectId);
    if (useLinks.getState().projectId === projectId) set({ links, loading: false });
  } catch {
    if (useLinks.getState().projectId === projectId) set({ loading: false, failed: true });
  }
}

export async function addLink(projectId: string, kind: ProjectLink['kind'], url: string, title: string) {
  const { link } = await api.addLink(projectId, kind, url, title);
  if (useLinks.getState().projectId === projectId) set((s) => ({ links: [...s.links, link] }));
  toast.success('space.link.added');
  return link;
}

export async function updateLink(projectId: string, id: string, url: string, title: string) {
  const { link } = await api.updateLink(projectId, id, url, title);
  set((s) => ({ links: s.links.map((l) => (l.id === id ? link : l)) }));
  toast.success('space.link.saved');
}

export async function removeLink(projectId: string, id: string) {
  await api.deleteLink(projectId, id);
  set((s) => ({ links: s.links.filter((l) => l.id !== id) }));
  toast.success('space.link.removed');
}

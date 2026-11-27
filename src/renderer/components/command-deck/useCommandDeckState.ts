import { useEffect, useMemo, useRef, useState } from 'react';
import { composeModelId, groupModelsByBase, splitModelAndEffort } from '../../../shared/models';
import { PROVIDER_MODELS } from '../../../shared/presets';
import {
  AccountScope,
  CodingPermissionMode,
  CreateTaskInput,
  EffortLevel,
  GitWorkspaceStatus,
  OrchestratedTask,
  SwitchboardState,
  TaskAttachment,
} from '../../../shared/types';

function loadSavedPermission(): CodingPermissionMode {
  try {
    const saved = window.localStorage.getItem('switchboard:permission-mode');
    if (saved === 'full-auto' || saved === 'accept-edits' || saved === 'read-only') return saved;
  } catch { /* ignore */ }
  return 'full-auto';
}

export function useCommandDeckState(params: {
  state: SwitchboardState;
  activeProjectId: string | null;
  onEnqueueTask: (input: CreateTaskInput) => Promise<OrchestratedTask | null>;
  onGitStatus: (cwd: string) => Promise<GitWorkspaceStatus>;
}) {
  const { state, activeProjectId, onEnqueueTask, onGitStatus } = params;
  const activeProject = state.projects.find((p) => p.id === activeProjectId) ?? null;

  const visibleThreads = useMemo(() => {
    const list = activeProjectId ? state.threads.filter((t) => t.projectId === activeProjectId) : state.threads;
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [state.threads, activeProjectId]);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(visibleThreads[0]?.id ?? null);
  const [inspectorTab, setInspectorTab] = useState<'response' | 'changes'>('response');
  const [gitStatus, setGitStatus] = useState<GitWorkspaceStatus | null>(null);
  const [loadingGit, setLoadingGit] = useState(false);

  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);
  const [mode, setMode] = useState<'coding' | 'general'>('coding');
  const [permissionMode, setPermissionMode] = useState<CodingPermissionMode>(loadSavedPermission);
  const [fastMode, setFastMode] = useState(false);
  const [workspaceDir, setWorkspaceDir] = useState(activeProject?.path || state.settings.defaultWorkspaceDir || '');
  const [workspaceScope, setWorkspaceScope] = useState<AccountScope>(activeProject?.scope || 'any');
  const [forcedAccountId, setForcedAccountId] = useState('');
  const [forcedBaseModel, setForcedBaseModel] = useState('');
  const [forcedEffort, setForcedEffort] = useState<EffortLevel | ''>('');
  const [autoDecompose, setAutoDecompose] = useState(state.settings.autoDecomposeMultiStep);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const replyInputRef = useRef<HTMLTextAreaElement | null>(null);
  const hasRunningTask = state.tasks.some((t) => t.status === 'running' || t.status === 'planning');

  const updatePermissionMode = (next: CodingPermissionMode) => {
    setPermissionMode(next);
    try { window.localStorage.setItem('switchboard:permission-mode', next); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!hasRunningTask) return;
    const id = setInterval(() => setNowTick(Date.now()), 200);
    return () => clearInterval(id);
  }, [hasRunningTask]);

  useEffect(() => {
    if (activeProject) {
      setWorkspaceDir(activeProject.path);
      setWorkspaceScope(activeProject.scope);
      setMode('coding');
    } else if (!workspaceDir && state.settings.defaultWorkspaceDir) {
      setWorkspaceDir(state.settings.defaultWorkspaceDir);
    }
  }, [activeProject, state.settings.defaultWorkspaceDir, workspaceDir]);

  useEffect(() => {
    if (!activeThreadId || !visibleThreads.some((t) => t.id === activeThreadId)) {
      setActiveThreadId(visibleThreads[0]?.id ?? null);
    }
  }, [activeThreadId, visibleThreads]);

  const activeThread = visibleThreads.find((t) => t.id === activeThreadId) ?? null;
  const threadTurns = useMemo(
    () => (activeThreadId ? state.tasks.filter((t) => t.threadId === activeThreadId).sort((a, b) => a.createdAt - b.createdAt) : []),
    [state.tasks, activeThreadId]
  );

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [activeThreadId, threadTurns.length]);

  const effectiveGitDir = (mode === 'coding' ? workspaceDir : '') || activeProject?.path || '';
  const refreshGit = async () => {
    if (!effectiveGitDir) { setGitStatus(null); return; }
    setLoadingGit(true);
    try { setGitStatus(await onGitStatus(effectiveGitDir)); } finally { setLoadingGit(false); }
  };

  useEffect(() => { void refreshGit(); }, [effectiveGitDir, state.tasks.length, hasRunningTask]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = prompt.trim() || (attachments.length > 0 ? 'Analyze the attached file(s).' : '');
    if (!cleaned) return;
    let resolvedForcedModel: string | null = null;
    let resolvedForcedEffort: EffortLevel | null = null;
    const pinned = forcedAccountId ? state.accounts.find((a) => a.id === forcedAccountId) : null;
    if (pinned) {
      const groups = groupModelsByBase(pinned.provider, state.discoveredModels?.[pinned.provider], PROVIDER_MODELS[pinned.provider] ?? []);
      const activeGroup = groups.find((g) => g.baseId === (forcedBaseModel || splitModelAndEffort(pinned.model).baseId));
      if (activeGroup && (forcedBaseModel || forcedEffort)) {
        resolvedForcedModel = composeModelId(activeGroup, (forcedEffort || undefined) ?? splitModelAndEffort(pinned.model).effort ?? pinned.effort);
        if (!activeGroup.suffixEncoded && forcedEffort) resolvedForcedEffort = forcedEffort;
      }
    }
    const created = await onEnqueueTask({
      prompt: cleaned,
      attachments: attachments.length > 0 ? attachments : undefined,
      projectId: activeProjectId,
      threadId: activeThreadId,
      mode,
      permissionMode: mode === 'coding' ? permissionMode : undefined,
      fastMode,
      workspaceDir: mode === 'coding' ? workspaceDir : undefined,
      workspaceScope,
      autoDecompose,
      forcedAccountId: forcedAccountId || null,
      forcedModel: resolvedForcedModel,
      forcedEffort: resolvedForcedEffort,
    });
    setPrompt('');
    setAttachments([]);
    setInspectorTab('response');
    if (created?.threadId) setActiveThreadId(created.threadId);
  };

  return {
    visibleThreads, activeThreadId, setActiveThreadId, activeThread, threadTurns,
    inspectorTab, setInspectorTab, gitStatus, loadingGit, refreshGit,
    prompt, setPrompt, attachments, setAttachments, mode, setMode,
    permissionMode, updatePermissionMode, fastMode, setFastMode,
    workspaceDir, setWorkspaceDir, workspaceScope, setWorkspaceScope,
    forcedAccountId, setForcedAccountId, forcedBaseModel, setForcedBaseModel,
    forcedEffort, setForcedEffort, autoDecompose, setAutoDecompose,
    copiedId, setCopiedId, nowTick, chatScrollRef, replyInputRef, handleSubmit,
  };
}

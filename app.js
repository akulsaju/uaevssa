import { createClient } from '@supabase/supabase-js';

const config = {
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
};
const configured = Boolean(config.url && config.key);
const supabase = configured ? createClient(config.url, config.key) : null;
const state = {
  user: null,
  workspace: null,
  flows: [],
  isDemo: false,
  cloudAccounts: [],
  cloudScans: [],
  cloudResources: [],
  selectedFlow: null,
  editingFlow: null,
  sessionVersion: 0,
  toastTimer: null,
  verificationEmail: sessionStorage.getItem('boundary_verification_email') || '',
  verificationTimer: null,
  tutorialIndex: 0,
  tutorialAutoShownFor: null,
  highlightedTutorialTarget: null,
  passwordRecovery: new URLSearchParams(window.location.hash.slice(1)).get('type') === 'recovery'
};

const authScreen = document.querySelector('#auth-screen');
const appShell = document.querySelector('#app-shell');
const bootScreen = document.querySelector('#boot-screen');
const authForm = document.querySelector('#auth-form');
const authFeedback = document.querySelector('#auth-feedback');
const authSubmit = document.querySelector('#auth-submit');
const authModeToggle = document.querySelector('#auth-mode-toggle');
const tableBody = document.querySelector('#flows-table-body');
const searchInput = document.querySelector('#search-input');
const statusFilter = document.querySelector('#status-filter');
const regionFilter = document.querySelector('#region-filter');
const emptyState = document.querySelector('#empty-state');
const resultsCount = document.querySelector('#results-count');
const detailDialog = document.querySelector('#flow-dialog');
const detailContent = document.querySelector('#dialog-content');
const editorBackdrop = document.querySelector('#flow-form-backdrop');
const flowForm = document.querySelector('#flow-form');
const flowFormError = document.querySelector('#flow-form-error');
const toast = document.querySelector('#toast');

const providerClasses = { AWS: 'provider-aws', GCP: 'provider-gcp', Azure: 'provider-azure', Other: 'provider-other' };
const providerMarks = { AWS: 'a', GCP: 'G', Azure: 'A', Other: 'O' };
const dataClasses = { PII: 'data-pii', Financial: 'data-financial', Internal: 'data-internal', Sensitive: 'data-sensitive', Public: 'data-internal' };
const statusClasses = { violation: 'pill-blocked', 'at-risk': 'pill-at-risk', compliant: 'pill-compliant' };
const statusLabels = { violation: 'Violation', 'at-risk': 'At risk', compliant: 'Compliant' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function setToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle('toast-error', isError);
  toast.classList.add('visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500);
}

function setAuthFeedback(message, isError = false) {
  authFeedback.textContent = message;
  authFeedback.classList.toggle('error', isError);
}

function setAuthMode(mode) {
  const isSignup = mode === 'signup';
  const isReset = mode === 'reset';
  document.querySelector('#auth-title').textContent = isSignup ? 'Create your workspace' : isReset ? 'Set a new password' : 'Welcome back';
  document.querySelector('#auth-description').textContent = isSignup
    ? 'Create an account to start a private data-flow inventory.'
    : isReset ? 'Choose a new password for your account.' : 'Sign in to your secure workspace.';
  document.querySelector('#name-field').hidden = !isSignup;
  document.querySelector('#workspace-field').hidden = !isSignup;
  document.querySelector('#confirm-password-field').hidden = !isReset;
  document.querySelector('#email-verification').hidden = true;
  document.querySelector('#auth-security').hidden = false;
  authForm.hidden = false;
  document.querySelector('#full-name').required = isSignup;
  document.querySelector('#workspace-name').required = isSignup;
  document.querySelector('#confirm-password').required = isReset;
  document.querySelector('#password').autocomplete = isSignup || isReset ? 'new-password' : 'current-password';
  document.querySelector('#forgot-password').hidden = isSignup || isReset;
  document.querySelector('#auth-switch').hidden = isReset;
  document.querySelector('#auth-switch-copy').textContent = isSignup ? 'Already have an account?' : 'New to Boundary?';
  authModeToggle.textContent = isSignup ? 'Sign in' : 'Create an account';
  authSubmit.textContent = isSignup ? 'Create account' : isReset ? 'Update password' : 'Sign in';
  authSubmit.dataset.idleText = authSubmit.textContent;
  setAuthFeedback('');
  authScreen.dataset.mode = mode;
}

function showVerificationScreen(email) {
  state.verificationEmail = email;
  sessionStorage.setItem('boundary_verification_email', email);
  authScreen.dataset.mode = 'verify';
  document.querySelector('#auth-title').textContent = 'Verify your email';
  document.querySelector('#auth-description').textContent = 'One quick step before you can open your private workspace.';
  document.querySelector('#verification-email').textContent = email;
  document.querySelector('#verification-feedback').textContent = '';
  document.querySelector('#email-verification').hidden = false;
  authForm.hidden = true;
  document.querySelector('#auth-switch').hidden = true;
  document.querySelector('#auth-security').hidden = true;
  document.querySelector('#resend-verification').focus();
}

function startVerificationCooldown(seconds = 30) {
  const button = document.querySelector('#resend-verification');
  clearInterval(state.verificationTimer);
  let remaining = seconds;
  button.disabled = true;
  button.textContent = `Resend in ${remaining}s`;
  state.verificationTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(state.verificationTimer);
      state.verificationTimer = null;
      button.disabled = false;
      button.textContent = 'Resend confirmation email';
      return;
    }
    button.textContent = `Resend in ${remaining}s`;
  }, 1000);
}

function setBusy(button, busy, busyText) {
  button.disabled = busy;
  button.dataset.idleText ??= button.textContent;
  button.textContent = busy ? busyText : button.dataset.idleText;
}

function userDisplayName(user) {
  return user.user_metadata?.full_name?.trim() || user.email?.split('@')[0] || 'Account';
}

function showAuthenticatedShell(user, workspace) {
  state.user = user;
  state.workspace = workspace;
  const isDemo = Boolean(state.isDemo);
  authScreen.hidden = true;
  bootScreen.hidden = true;
  appShell.hidden = false;
  document.querySelector('#demo-mode-badge').hidden = !isDemo;
  document.querySelector('#demo-banner').hidden = !isDemo;
  for (const selector of ['#add-flow-button', '#add-cloud-account', '#cloud-connect-open', '#workspace-settings-open']) {
    document.querySelector(selector).hidden = isDemo;
  }

  const displayName = userDisplayName(user);
  const initials = displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  document.querySelector('.workspace-icon').textContent = workspace.name.slice(0, 1).toUpperCase();
  document.querySelector('#workspace-label').textContent = workspace.name;
  document.querySelector('#breadcrumb-workspace').textContent = workspace.name;
  document.querySelector('#user-name').textContent = displayName;
  document.querySelector('#user-email').textContent = user.email || 'Signed in';
  document.querySelector('#user-avatar').textContent = initials;
  document.querySelector('#top-avatar').textContent = initials;
  document.querySelector('#greeting').innerHTML = `Your residency overview <span class="wave">✳</span>`;
}

function createDemoWorkspace() {
  const now = Date.now();
  const recent = (hours) => new Date(now - hours * 60 * 60 * 1000).toISOString();
  const id = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
  const demoUser = {
    id: 'demo-user',
    email: 'demo@example.invalid',
    user_metadata: { full_name: 'Alex Morgan', workspace_name: 'Northstar Demo' }
  };
  state.isDemo = true;
  state.user = demoUser;
  state.workspace = { id: 'demo-workspace', name: 'Northstar Demo' };
  state.flows = [
    {
      id: id('101'), workspace_id: 'demo-workspace', flow_ref: 'FLOW-001', name: 'Customer profile sync',
      cloud_provider: 'AWS', classification: 'PII', source_region: 'EU West (Ireland)',
      destination_region: 'US East (N. Virginia)', source_jurisdiction: 'IE', destination_jurisdiction: 'US',
      manual_status: 'compliant', status: 'violation', policy_name: 'Cross-border review',
      notes: 'Sample record: confirm transfer safeguards and destination controls.', reviewed: false,
      created_at: recent(72), updated_at: recent(2)
    },
    {
      id: id('102'), workspace_id: 'demo-workspace', flow_ref: 'FLOW-002', name: 'Payment settlement batch',
      cloud_provider: 'Azure', classification: 'Financial', source_region: 'UAE Central',
      destination_region: 'UAE North', source_jurisdiction: 'AE', destination_jurisdiction: 'AE',
      manual_status: 'at-risk', status: 'at-risk', policy_name: 'Finance data handling',
      notes: 'Sample record: validate retention and encryption settings.', reviewed: false,
      created_at: recent(48), updated_at: recent(8)
    },
    {
      id: id('103'), workspace_id: 'demo-workspace', flow_ref: 'FLOW-003', name: 'Analytics event stream',
      cloud_provider: 'GCP', classification: 'Sensitive', source_region: 'EU West (Belgium)',
      destination_region: 'EU West (Netherlands)', source_jurisdiction: 'BE', destination_jurisdiction: 'NL',
      manual_status: 'compliant', status: 'violation', policy_name: 'Regional data boundary',
      notes: 'Fictional sample. Different country codes are flagged for review.', reviewed: true,
      created_at: recent(120), updated_at: recent(24)
    },
    {
      id: id('104'), workspace_id: 'demo-workspace', flow_ref: 'FLOW-004', name: 'Internal reporting export',
      cloud_provider: 'AWS', classification: 'Internal', source_region: 'US West (Oregon)',
      destination_region: 'US East (Ohio)', source_jurisdiction: 'US', destination_jurisdiction: 'US',
      manual_status: 'compliant', status: 'compliant', policy_name: 'Internal use',
      notes: 'Sample record: same recorded jurisdiction.', reviewed: true,
      created_at: recent(96), updated_at: recent(36)
    }
  ];
  state.cloudAccounts = [
    {
      id: id('201'), workspace_id: state.workspace.id, provider: 'AWS', display_name: 'Demo AWS production',
      account_identifier: '111122223333', role_arn: 'arn:aws:iam::111122223333:role/BoundaryReadOnly',
      created_by: demoUser.id, created_at: recent(144)
    },
    {
      id: id('202'), workspace_id: state.workspace.id, provider: 'Azure', display_name: 'Demo Azure subscription',
      account_identifier: '00000000-0000-4000-8000-000000000202',
      subscription_id: '00000000-0000-4000-8000-000000000202',
      created_by: demoUser.id, created_at: recent(120)
    },
    {
      id: id('203'), workspace_id: state.workspace.id, provider: 'GCP', display_name: 'Demo GCP analytics',
      account_identifier: 'northstar-demo', project_id: 'northstar-demo',
      created_by: demoUser.id, created_at: recent(96)
    }
  ];
  state.cloudScans = state.cloudAccounts.map((account, index) => ({
    id: id(String(301 + index)),
    account_id: account.id,
    status: 'succeeded',
    resource_count: [3, 2, 2][index],
    error_summary: '',
    started_at: recent(10 + index),
    completed_at: recent(9 + index)
  }));
  const resources = [
    ['301', 0, 'arn:aws:s3:::northstar-customer-profile', 's3:bucket', 'customer-profile', 'eu-west-1', 'IE', 'PII'],
    ['302', 0, 'arn:aws:rds:us-east-1:111122223333:db:billing', 'rds:db', 'billing', 'us-east-1', 'US', 'Financial'],
    ['303', 0, 'arn:aws:lambda:eu-west-1:111122223333:function:events', 'lambda:function', 'events', 'eu-west-1', 'IE', 'Unclassified'],
    ['304', 1, '/subscriptions/demo/resourceGroups/rg-demo/providers/Microsoft.Storage/storageAccounts/northstarlogs', 'microsoft.storage/storageaccounts', 'northstarlogs', 'uaenorth', 'AE', 'Internal'],
    ['305', 1, '/subscriptions/demo/resourceGroups/rg-demo/providers/Microsoft.Sql/servers/customerdb', 'microsoft.sql/servers', 'customerdb', 'uaecentral', 'AE', 'Sensitive'],
    ['306', 2, '//cloudresourcemanager.googleapis.com/projects/northstar-demo/buckets/northstar-analytics', 'storage.googleapis.com/Bucket', 'northstar-analytics', 'europe-west1', 'BE', 'Sensitive'],
    ['307', 2, '//cloudresourcemanager.googleapis.com/projects/northstar-demo/instances/reporting', 'compute.googleapis.com/Instance', 'reporting', 'us-central1', 'US', 'Unclassified']
  ];
  state.cloudResources = resources.map(([resourceId, accountIndex, resourceIdentifier, resourceType, displayName, region, jurisdiction, classification], index) => ({
    id: id(resourceId),
    account_id: state.cloudAccounts[accountIndex].id,
    last_seen_scan_id: state.cloudScans[accountIndex].id,
    provider: state.cloudAccounts[accountIndex].provider,
    resource_identifier: resourceIdentifier,
    resource_type: resourceType,
    display_name: displayName,
    region,
    jurisdiction,
    classification,
    last_seen_at: recent(index + 1)
  }));
  showAuthenticatedShell(demoUser, state.workspace);
  document.querySelector('#workspace-error').hidden = true;
  renderDashboard();
  renderCloudDiscovery();
}

function isDemoMode() {
  return state.isDemo;
}

async function ensureWorkspace(user) {
  const { data: existingWorkspace, error: lookupError } = await supabase
    .from('boundary_workspaces')
    .select('id, name')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existingWorkspace) return existingWorkspace;

  const suggestedName = user.user_metadata?.workspace_name?.trim()
    || `${userDisplayName(user)}'s workspace`;
  const { data: workspaceId, error: createError } = await supabase.rpc('boundary_create_workspace', {
    p_name: suggestedName
  });
  if (createError) throw createError;
  const { data: createdWorkspace, error: fetchError } = await supabase
    .from('boundary_workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .single();
  if (fetchError) throw fetchError;
  return createdWorkspace;
}

async function loadFlows() {
  if (!state.workspace) return;
  const { data, error } = await supabase
    .from('boundary_flows')
    .select('id, workspace_id, flow_ref, name, cloud_provider, classification, source_region, destination_region, source_jurisdiction, destination_jurisdiction, manual_status, status, policy_name, notes, reviewed, created_at, updated_at')
    .eq('workspace_id', state.workspace.id)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  state.flows = data;
  renderDashboard();
  document.querySelector('#last-updated').textContent = 'just now';
}

function setWorkspaceError(error) {
  const banner = document.querySelector('#workspace-error');
  document.querySelector('#workspace-error-text').textContent = error.message || 'The workspace could not be loaded.';
  banner.hidden = false;
}

const tutorialSteps = [
  {
    title: 'Welcome to Boundary',
    description: 'Your private workspace helps you keep track of where sensitive information moves—and spot cross-border flows that may need a closer look.',
    note: 'Cloud discovery reads resource configuration only. Boundary does not observe or block network traffic.',
    icon: '✦',
    preview: '<div class="tutorial-welcome-preview"><span>YOUR WORKSPACE</span><strong>Map sensitive data movement.</strong><div><i>PRIVATE BY DEFAULT</i><i>BUILT FOR REVIEW</i></div></div>'
  },
  {
    title: 'Know what needs attention',
    description: 'Your overview updates from saved records: tracked transfers, cross-jurisdiction findings, flows needing review, and regions in use.',
    note: 'The counts reflect your inventory only—not a live scan or certification.',
    icon: '▦',
    preview: '<div class="tutorial-metric-preview"><span><b>01</b> tracked flow</span><span class="preview-risk"><b>01</b> needs review</span><span><b>02</b> jurisdictions</span></div>',
    target: '#overview-metrics'
  },
  {
    title: 'Record the journey—not just the region',
    description: 'For every flow, add its cloud provider, data class, source and destination regions, and two-letter country codes. Different countries are flagged for PII, financial, and sensitive data.',
    note: 'Example: Germany (DE) → United States (US) creates a finding. This starter rule is not legal advice.',
    icon: '◎',
    preview: '<div class="tutorial-flow-preview"><div><small>SOURCE</small><strong>Frankfurt <i>DE</i></strong></div><span class="preview-arrow">→</span><div><small>DESTINATION</small><strong>Virginia <i>US</i></strong></div><span class="preview-flag">SENSITIVE DATA · CROSS-BORDER</span></div>',
    target: '#region-inventory'
  },
  {
    title: 'Turn findings into a review workflow',
    description: 'Open a finding to see its flow details and notes. Filter by status or region, mark records as reviewed, edit incorrect entries, and export a CSV for follow-up.',
    note: 'A finding is a signal for your team—not a transfer block or compliance certification.',
    icon: '◇',
    preview: '<div class="tutorial-review-preview"><span><i>!</i> PII · DE → US</span><b>Review the transfer</b><small>Inspect → assign follow-up → mark reviewed</small></div>',
    target: '#findings'
  },
  {
    title: 'Make your first inventory record',
    description: 'Start with one important transfer. Choose its data classification and record both ends of the journey. Boundary saves it to your private workspace and calculates its review status.',
    note: 'The data-flow inventory is manual. Cloud accounts can separately discover tagged resources and regions.',
    icon: '＋',
    preview: '<div class="tutorial-start-preview"><span>READY WHEN YOU ARE</span><strong>One flow is enough to get started.</strong><small>Usually takes less than a minute</small></div>',
    target: '#add-flow-button',
    action: 'add-flow'
  }
];

function tutorialStorageKey() {
  return state.user ? `boundary_tutorial_completed_${state.user.id}` : null;
}

function clearTutorialHighlight() {
  state.highlightedTutorialTarget?.classList.remove('tutorial-target');
  state.highlightedTutorialTarget = null;
}

function renderTutorialStep() {
  const step = tutorialSteps[state.tutorialIndex];
  clearTutorialHighlight();
  document.querySelector('#tutorial-title').textContent = step.title;
  document.querySelector('#tutorial-description').textContent = step.description;
  document.querySelector('#tutorial-note').textContent = step.note;
  document.querySelector('#tutorial-icon').textContent = step.icon;
  document.querySelector('#tutorial-preview').innerHTML = step.preview;
  document.querySelector('#tutorial-kicker').textContent = `GETTING STARTED · ${state.tutorialIndex + 1} OF ${tutorialSteps.length}`;
  document.querySelector('#tutorial-previous').disabled = state.tutorialIndex === 0;
  document.querySelector('#tutorial-next').textContent = step.action ? 'Add first flow' : state.tutorialIndex === tutorialSteps.length - 1 ? 'Finish' : 'Next';
  document.querySelector('#tutorial-skip').textContent = state.tutorialIndex === tutorialSteps.length - 1 ? 'Maybe later' : 'Skip tutorial';
  document.querySelector('#tutorial-progress').innerHTML = tutorialSteps.map((_, index) =>
    `<span class="tutorial-progress-dot${index === state.tutorialIndex ? ' active' : ''}" aria-hidden="true"></span>`
  ).join('');

  if (step.target) {
    state.highlightedTutorialTarget = document.querySelector(step.target);
    state.highlightedTutorialTarget?.classList.add('tutorial-target');
    state.highlightedTutorialTarget?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function closeTutorial(completed = true) {
  document.querySelector('#tutorial-backdrop').hidden = true;
  clearTutorialHighlight();
  if (completed) {
    const key = tutorialStorageKey();
    if (key) localStorage.setItem(key, 'true');
  }
  document.querySelector('#tutorial-open').focus();
}

function openTutorial() {
  if (!state.user || !state.workspace) return;
  state.tutorialIndex = 0;
  renderTutorialStep();
  document.querySelector('#tutorial-backdrop').hidden = false;
  document.querySelector('#tutorial-close').focus();
}

function maybeStartTutorial() {
  const key = tutorialStorageKey();
  if (key && state.tutorialAutoShownFor !== key && localStorage.getItem(key) !== 'true') {
    state.tutorialAutoShownFor = key;
    openTutorial();
  }
}

async function syncSession(session) {
  const version = ++state.sessionVersion;
  const user = session?.user || null;
  state.isDemo = false;
  document.querySelector('#demo-mode-badge').hidden = true;
  document.querySelector('#demo-banner').hidden = true;
  if (!user) {
    const signedOut = Boolean(state.user);
    state.user = null;
    state.workspace = null;
    state.flows = [];
    state.cloudAccounts = [];
    state.cloudScans = [];
    state.cloudResources = [];
    appShell.hidden = true;
    bootScreen.hidden = true;
    authScreen.hidden = false;
    document.querySelector('#auth-setup-message').hidden = configured;
    if (state.verificationEmail && !state.passwordRecovery) {
      showVerificationScreen(state.verificationEmail);
      return;
    }
    if (signedOut) setAuthMode('signin');
    return;
  }

  state.verificationEmail = '';
  sessionStorage.removeItem('boundary_verification_email');
  if (state.passwordRecovery) {
    state.user = user;
    appShell.hidden = true;
    bootScreen.hidden = true;
    authScreen.hidden = false;
    setAuthMode('reset');
    return;
  }

  appShell.hidden = false;
  authScreen.hidden = true;
  bootScreen.hidden = true;
  try {
    const workspace = await ensureWorkspace(user);
    if (version !== state.sessionVersion) return;
    showAuthenticatedShell(user, workspace);
    document.querySelector('#workspace-error').hidden = true;
    await loadFlows();
    await loadCloudDataSafely();
    if (version === state.sessionVersion) maybeStartTutorial();
  } catch (error) {
    if (version !== state.sessionVersion) return;
    showAuthenticatedShell(user, { name: user.user_metadata?.workspace_name || 'Workspace' });
    setWorkspaceError(error);
  }
}

function filteredFlows() {
  const query = searchInput.value.trim().toLowerCase();
  const status = statusFilter.value;
  const region = regionFilter.value;
  return state.flows.filter((flow) => {
    const values = [
      flow.name,
      flow.flow_ref,
      flow.cloud_provider,
      flow.classification,
      flow.source_region,
      flow.destination_region,
      flow.source_jurisdiction,
      flow.destination_jurisdiction,
      flow.policy_name,
      flow.notes
    ];
    const matchesQuery = !query || values.some((value) => value?.toLowerCase().includes(query));
    const matchesStatus = status === 'all' || flow.status === status;
    const matchesRegion = region === 'all' || flow.source_region === region || flow.destination_region === region;
    return matchesQuery && matchesStatus && matchesRegion;
  });
}

function updateRegionFilter() {
  const selected = regionFilter.value;
  const regions = [...new Set(state.flows.flatMap((flow) => [flow.source_region, flow.destination_region]))].sort();
  regionFilter.innerHTML = '<option value="all">All regions</option>' + regions.map((region) =>
    `<option value="${escapeHtml(region)}">${escapeHtml(region)}</option>`
  ).join('');
  regionFilter.value = regions.includes(selected) ? selected : 'all';
}

function formatLastSeen(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min ago`;
  const hours = Math.floor(elapsedMinutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return date.toLocaleDateString();
}

function renderMetrics() {
  const count = state.flows.length;
  const violations = state.flows.filter((flow) => flow.status === 'violation').length;
  const needsAttention = state.flows.filter((flow) => flow.status !== 'compliant').length;
  const compliant = count ? Math.round((state.flows.filter((flow) => flow.status === 'compliant').length / count) * 100) : null;
  const regions = new Set(state.flows.flatMap((flow) => [flow.source_region, flow.destination_region]));
  const providers = new Set(state.flows.map((flow) => flow.cloud_provider));

  document.querySelector('#total-flow-count').textContent = String(count);
  document.querySelector('#flow-count-badge').textContent = String(count);
  document.querySelector('#violation-count').textContent = String(violations);
  document.querySelector('#finding-count').textContent = String(needsAttention);
  document.querySelector('#finding-summary').textContent = needsAttention
    ? `${needsAttention} flow${needsAttention === 1 ? '' : 's'} need review`
    : 'No flagged flows';
  document.querySelector('#compliance-score').textContent = compliant === null ? '—' : String(compliant);
  document.querySelector('#compliance-bar').style.width = `${compliant ?? 0}%`;
  document.querySelector('#region-count').textContent = String(regions.size);
  document.querySelector('#provider-summary').textContent = providers.size
    ? `Across ${providers.size} provider${providers.size === 1 ? '' : 's'}`
    : 'No cloud providers recorded';
}

function renderRegions() {
  const usage = new Map();
  for (const flow of state.flows) {
    usage.set(flow.source_region, (usage.get(flow.source_region) || 0) + 1);
    usage.set(flow.destination_region, (usage.get(flow.destination_region) || 0) + 1);
  }
  const entries = [...usage.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const container = document.querySelector('#region-inventory');
  if (!entries.length) {
    container.innerHTML = '<div class="region-empty"><span>◎</span><strong>No regions recorded</strong><p>Add a flow to see its source and destination regions here.</p></div>';
    return;
  }
  const max = entries[0][1];
  container.innerHTML = entries.map(([region, count]) => `
    <div class="region-row">
      <span class="region-pin" aria-hidden="true">◎</span>
      <span class="region-row-name">${escapeHtml(region)}</span>
      <span class="region-meter"><span style="width:${Math.round((count / max) * 100)}%"></span></span>
      <span class="region-row-count">${count}</span>
    </div>
  `).join('');
}

function renderFindings() {
  const findings = state.flows.filter((flow) => flow.status !== 'compliant');
  const list = document.querySelector('#finding-list');
  if (!findings.length) {
    list.innerHTML = '<div class="findings-empty">No flagged flows. Add a transfer record and review its status.</div>';
    return;
  }
  list.innerHTML = findings.slice(0, 3).map((flow) => {
    const violation = flow.status === 'violation';
    const reason = flow.policy_name || flow.classification;
    return `
      <button class="finding-item" type="button" data-flow-id="${escapeHtml(flow.id)}">
        <span class="finding-symbol ${violation ? 'finding-critical' : 'finding-warning'}">${violation ? '!' : '↗'}</span>
        <span class="finding-copy"><strong>${escapeHtml(flow.name)}</strong><small>${escapeHtml(flow.source_region)} → ${escapeHtml(flow.destination_region)} · ${escapeHtml(reason)}</small></span>
        <span class="finding-age">${escapeHtml(formatLastSeen(flow.updated_at))}</span>
      </button>
    `;
  }).join('');
}

function renderFlows() {
  updateRegionFilter();
  const filtered = filteredFlows();
  tableBody.innerHTML = filtered.map((flow) => `
    <tr tabindex="0" data-flow-id="${escapeHtml(flow.id)}" aria-label="View ${escapeHtml(flow.name)} flow details">
      <td><div class="flow-cell"><span class="flow-icon" aria-hidden="true">⌁</span><span class="flow-name"><strong>${escapeHtml(flow.name)}</strong><small>${escapeHtml(flow.flow_ref)}</small></span></div></td>
      <td><span class="provider-cell"><span class="provider-mark ${providerClasses[flow.cloud_provider] || providerClasses.Other}" aria-hidden="true">${escapeHtml(providerMarks[flow.cloud_provider] || 'O')}</span>${escapeHtml(flow.source_region)}</span></td>
      <td>${escapeHtml(flow.destination_region)}</td>
      <td><span class="data-label ${dataClasses[flow.classification] || dataClasses.Internal}">${escapeHtml(flow.classification)}</span></td>
      <td><span class="status-pill ${statusClasses[flow.status] || statusClasses['at-risk']}">${escapeHtml(statusLabels[flow.status] || flow.status)}</span></td>
      <td><span class="last-seen">${escapeHtml(formatLastSeen(flow.updated_at))}</span></td>
      <td><button class="row-more" type="button" data-flow-id="${escapeHtml(flow.id)}" aria-label="Details for ${escapeHtml(flow.name)}">···</button></td>
    </tr>
  `).join('');

  emptyState.hidden = filtered.length > 0;
  tableBody.hidden = filtered.length === 0;
  resultsCount.textContent = `Showing ${filtered.length} of ${state.flows.length} record${state.flows.length === 1 ? '' : 's'}`;
  renderMetrics();
  renderRegions();
  renderFindings();
}

function renderDashboard() {
  renderFlows();
}

async function loadCloudData() {
  if (!state.workspace || !state.user) return;
  const [accountsResult, scansResult] = await Promise.all([
    supabase.from('boundary_cloud_accounts')
      .select('id, workspace_id, provider, display_name, account_identifier, role_arn, tenant_id, client_id, subscription_id, project_id, project_number, workload_identity_pool_id, workload_identity_provider_id, service_account_email, created_by, created_at')
      .eq('workspace_id', state.workspace.id)
      .order('created_at', { ascending: false }),
    supabase.from('boundary_cloud_scans')
      .select('id, account_id, status, resource_count, error_summary, started_at, completed_at')
      .eq('workspace_id', state.workspace.id)
      .order('started_at', { ascending: false })
      .limit(100)
  ]);
  const failed = [accountsResult, scansResult].find((result) => result.error);
  if (failed?.error) throw failed.error;
  const resources = [];
  for (let from = 0; from < 10000; from += 500) {
    const { data, error } = await supabase.from('boundary_cloud_resources')
      .select('id, account_id, last_seen_scan_id, provider, resource_identifier, resource_type, display_name, region, jurisdiction, classification, last_seen_at')
      .eq('workspace_id', state.workspace.id)
      .order('last_seen_at', { ascending: false })
      .range(from, from + 499);
    if (error) throw error;
    resources.push(...(data || []));
    if ((data || []).length < 500) break;
  }
  state.cloudAccounts = accountsResult.data || [];
  state.cloudScans = scansResult.data || [];
  state.cloudResources = resources;
  renderCloudDiscovery();
}

function renderCloudDiscovery() {
  const accountList = document.querySelector('#cloud-account-list');
  const emptyState = document.querySelector('#cloud-resource-empty');
  const tableWrap = document.querySelector('#cloud-resource-table-wrap');
  const tableBody = document.querySelector('#cloud-resource-table-body');
  if (!accountList || !emptyState || !tableWrap || !tableBody) return;

  const latestScans = new Map();
  const latestSuccessfulScans = new Map();
  for (const scan of state.cloudScans) {
    if (!latestScans.has(scan.account_id)) latestScans.set(scan.account_id, scan);
    if (scan.status === 'succeeded' && !latestSuccessfulScans.has(scan.account_id)) {
      latestSuccessfulScans.set(scan.account_id, scan.id);
    }
  }
  accountList.innerHTML = state.cloudAccounts.map((account) => {
    const latest = latestScans.get(account.id);
    const isOwner = account.created_by === state.user?.id;
    const scanIsStale = latest?.status === 'running'
      && Date.now() - new Date(latest.started_at).getTime() > 15 * 60 * 1000;
    const status = latest
      ? latest.status === 'succeeded'
        ? `${latest.resource_count} resources · ${formatLastSeen(latest.completed_at)}`
        : latest.status === 'running' && !scanIsStale
          ? 'Scan in progress'
          : latest.status === 'running'
            ? 'Scan timed out · retry'
          : `Last scan failed · ${latest.error_summary || 'Check permissions and retry'}`
      : 'Never scanned';
    return `<article class="cloud-account-card">
      <span class="cloud-provider-mark">${escapeHtml(account.provider)}</span>
      <span class="cloud-account-copy"><strong>${escapeHtml(account.display_name)}</strong><small>${escapeHtml(account.account_identifier)} · ${escapeHtml(status)}</small></span>
      ${!isDemoMode() ? `<button class="button button-secondary cloud-scan-button" type="button" data-scan-account="${escapeHtml(account.id)}"${!isOwner || (latest?.status === 'running' && !scanIsStale) ? ' disabled' : ''}>${latest?.status === 'running' && !scanIsStale ? 'Scanning…' : latest?.status === 'running' ? 'Retry scan' : 'Scan now'}</button>
      ${isOwner ? `<button class="cloud-remove-button" type="button" data-remove-account="${escapeHtml(account.id)}" aria-label="Disconnect ${escapeHtml(account.display_name)}">×</button>` : ''}` : ''}
    </article>`;
  }).join('');

  const successScanIds = new Set(latestSuccessfulScans.values());
  const resources = state.cloudResources.filter((resource) => successScanIds.has(resource.last_seen_scan_id));
  emptyState.hidden = resources.length > 0;
  tableWrap.hidden = resources.length === 0;
  if (!state.cloudAccounts.length) emptyState.textContent = 'Connect a read-only cloud account to discover its resources.';
  else if (!resources.length && successScanIds.size) emptyState.textContent = 'The latest successful scan found no resources in this account scope.';
  else if (!resources.length) emptyState.textContent = 'No successful scans yet. Connect or scan an account to populate its resource inventory.';
  tableBody.innerHTML = resources.map((resource) => `
    <tr>
      <td><div class="cloud-resource-cell"><strong>${escapeHtml(resource.display_name)}</strong><small>${escapeHtml(resource.resource_type)} · ${escapeHtml(resource.resource_identifier)}</small></div></td>
      <td>${escapeHtml(resource.provider)}</td>
      <td>${escapeHtml(resource.region || 'Unknown')}</td>
      <td><span class="jurisdiction-pill${resource.jurisdiction === 'UN' ? ' unknown' : ''}">${escapeHtml(resource.jurisdiction)}</span></td>
      <td><span class="data-label ${dataClasses[resource.classification] || 'data-internal'}">${escapeHtml(resource.classification)}</span></td>
      <td><span class="last-seen">${escapeHtml(formatLastSeen(resource.last_seen_at))}</span></td>
    </tr>
  `).join('');
}

function setCloudError(message = '') {
  const error = document.querySelector('#cloud-discovery-error');
  error.textContent = message;
  error.hidden = !message;
}

async function loadCloudDataSafely() {
  try {
    await loadCloudData();
    setCloudError();
  } catch (error) {
    setCloudError(error.message || 'Unable to load cloud inventory.');
  }
}

function updateFederationInstructions() {
  const provider = document.querySelector('#cloud-provider').value;
  document.querySelectorAll('[data-provider-fields]').forEach((panel) => {
    panel.hidden = panel.dataset.providerFields !== provider;
  });
  const issuer = `${config.url}/auth/v1`;
  const subject = state.user?.id || 'Sign in to load your subject';
  const audience = 'authenticated';
  const common = `<p><strong>OIDC issuer:</strong> <code>${escapeHtml(issuer)}</code><br><strong>Subject:</strong> <code>${escapeHtml(subject)}</code><br><strong>Audience:</strong> <code>${audience}</code></p>`;
  const guidance = {
    AWS: `${common}<p>Create an IAM OIDC provider for this issuer with client ID <code>${audience}</code>. Create a role whose trust policy permits <code>sts:AssumeRoleWithWebIdentity</code> only for this subject and audience. Attach a read-only policy for <code>tag:GetResources</code> and <code>ec2:DescribeRegions</code>. AWS returns tagged and previously tagged resources only; untagged resources are not discovered.</p><p><a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html" target="_blank" rel="noreferrer">AWS OIDC provider setup</a> · <a href="https://docs.aws.amazon.com/resourcegroupstagging/latest/APIReference/API_GetResources.html" target="_blank" rel="noreferrer">GetResources limitations</a></p>`,
    Azure: `${common}<p>Add a federated identity credential to an Entra application with this issuer, subject, and audience. Assign the application the built-in <strong>Reader</strong> role on the subscription. Resource Graph lists resource metadata and tags; it does not inspect traffic.</p><p><a href="https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation-create-trust-user-assigned-managed-identity" target="_blank" rel="noreferrer">Microsoft workload identity federation</a> · <a href="https://learn.microsoft.com/en-us/azure/governance/resource-graph/first-query-rest-api" target="_blank" rel="noreferrer">Azure Resource Graph API</a></p>`,
    GCP: `${common}<p>Create an OIDC workload identity pool provider for this issuer and allow audience <code>${audience}</code>; map <code>google.subject=assertion.sub</code>. Grant this subject permission to impersonate the selected service account. Grant that account <code>Cloud Asset Viewer</code> on the project and enable the Cloud Asset API.</p><p><a href="https://cloud.google.com/iam/docs/workload-identity-federation" target="_blank" rel="noreferrer">Google Workload Identity Federation</a> · <a href="https://cloud.google.com/asset-inventory/docs/reference/rest/v1/TopLevel/searchAllResources" target="_blank" rel="noreferrer">Cloud Asset Inventory API</a></p>`
  };
  document.querySelector('#cloud-federation-instructions').innerHTML = guidance[provider];
}

function openCloudAccountDialog() {
  document.querySelector('#cloud-account-error').textContent = '';
  document.querySelector('#cloud-display-name').value = '';
  document.querySelector('#cloud-provider').value = 'AWS';
  for (const id of [
    'aws-account-id', 'aws-role-arn', 'azure-tenant-id', 'azure-client-id', 'azure-subscription-id',
    'gcp-project-id', 'gcp-project-number', 'gcp-pool-id', 'gcp-provider-id', 'gcp-service-account'
  ]) document.getElementById(id).value = '';
  updateFederationInstructions();
  document.querySelector('#cloud-account-backdrop').hidden = false;
  document.querySelector('#cloud-display-name').focus();
}

async function saveCloudAccount() {
  if (isDemoMode()) return;
  const provider = document.querySelector('#cloud-provider').value;
  const displayName = document.querySelector('#cloud-display-name').value.trim();
  const errorElement = document.querySelector('#cloud-account-error');
  const payload = {
    workspace_id: state.workspace?.id,
    provider,
    display_name: displayName,
    created_by: state.user?.id,
    account_identifier: '',
    role_arn: null,
    tenant_id: null,
    client_id: null,
    subscription_id: null,
    project_id: null,
    project_number: null,
    workload_identity_pool_id: null,
    workload_identity_provider_id: null,
    service_account_email: null
  };
  if (!displayName || !state.workspace || !state.user) {
    errorElement.textContent = 'Enter an account label before saving.';
    return;
  }
  if (provider === 'AWS') {
    payload.account_identifier = document.querySelector('#aws-account-id').value.trim();
    payload.role_arn = document.querySelector('#aws-role-arn').value.trim();
    if (!/^\d{12}$/.test(payload.account_identifier) || !/^arn:aws(-[a-z0-9-]+)?:iam::\d{12}:role\/.+/.test(payload.role_arn)) {
      errorElement.textContent = 'Enter a 12-digit AWS account ID and a valid IAM role ARN.';
      return;
    }
  } else if (provider === 'Azure') {
    payload.tenant_id = document.querySelector('#azure-tenant-id').value.trim();
    payload.client_id = document.querySelector('#azure-client-id').value.trim();
    payload.subscription_id = document.querySelector('#azure-subscription-id').value.trim();
    payload.account_identifier = payload.subscription_id;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuid.test(payload.tenant_id) || !uuid.test(payload.client_id) || !uuid.test(payload.subscription_id)) {
      errorElement.textContent = 'Enter valid tenant, application, and subscription IDs.';
      return;
    }
  } else {
    payload.project_id = document.querySelector('#gcp-project-id').value.trim();
    payload.project_number = document.querySelector('#gcp-project-number').value.trim();
    payload.workload_identity_pool_id = document.querySelector('#gcp-pool-id').value.trim();
    payload.workload_identity_provider_id = document.querySelector('#gcp-provider-id').value.trim();
    payload.service_account_email = document.querySelector('#gcp-service-account').value.trim();
    payload.account_identifier = payload.project_id;
    if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(payload.project_id)
      || !/^\d+$/.test(payload.project_number)
      || !/^[a-z0-9-]{4,32}$/.test(payload.workload_identity_pool_id)
      || !/^[a-z0-9-]{4,32}$/.test(payload.workload_identity_provider_id)
      || !/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/i.test(payload.service_account_email)) {
      errorElement.textContent = 'Enter a valid Google Cloud project, workload identity, and service account.';
      return;
    }
  }
  const button = document.querySelector('#save-cloud-account');
  setBusy(button, true, 'Saving...');
  errorElement.textContent = '';
  try {
    const { error } = await supabase.from('boundary_cloud_accounts').insert(payload);
    if (error) throw error;
    document.querySelector('#cloud-account-backdrop').hidden = true;
    await loadCloudData();
    setCloudError();
    setToast(`${provider} account connected. Start an on-demand scan when ready.`);
  } catch (error) {
    errorElement.textContent = error.message || 'Unable to save this cloud account.';
  } finally {
    setBusy(button, false, 'Saving...');
  }
}

async function runCloudScan(accountId, button) {
  if (isDemoMode()) return;
  setBusy(button, true, 'Scanning...');
  setCloudError();
  try {
    const { data, error } = await supabase.functions.invoke('boundary-cloud-scan', {
      body: { account_id: accountId }
    });
    if (error) {
      let message = error.message;
      try {
        const details = await error.context?.json();
        if (details?.error) message = details.error;
      } catch {
        // Keep the SDK's original error if the response has no JSON body.
      }
      throw new Error(message);
    }
    if (data?.status !== 'succeeded') throw new Error(data?.error || 'Cloud scan did not complete.');
    await loadCloudData();
    setToast(`Discovery complete: ${data.resource_count} resources found.`);
  } catch (error) {
    const message = error.message || 'Unable to scan this cloud account.';
    try {
      await loadCloudData();
      setCloudError(message);
    } catch (refreshError) {
      setCloudError(`${message} — ${refreshError.message || 'scan status could not be refreshed'}`);
    }
  } finally {
    setBusy(button, false, 'Scanning...');
  }
}

async function removeCloudAccount(accountId) {
  if (isDemoMode()) return;
  const account = state.cloudAccounts.find((item) => item.id === accountId);
  if (!account || !window.confirm(`Disconnect "${account.display_name}" and remove its discovery history?`)) return;
  try {
    const { error } = await supabase.from('boundary_cloud_accounts').delete().eq('id', account.id);
    if (error) throw error;
    await loadCloudData();
    setToast('Cloud account disconnected.');
  } catch (error) {
    setCloudError(error.message || 'Unable to disconnect this cloud account.');
  }
}

function openWorkspaceSettings() {
  if (!state.workspace || isDemoMode()) return;
  document.querySelector('#settings-workspace-name').value = state.workspace.name;
  document.querySelector('#settings-user-email').textContent = state.user?.email || '';
  document.querySelector('#workspace-settings-error').textContent = '';
  document.querySelector('#workspace-settings-backdrop').hidden = false;
  document.querySelector('#settings-workspace-name').focus();
}

async function saveWorkspaceSettings(event) {
  event.preventDefault();
  if (!state.workspace || isDemoMode()) return;
  const name = document.querySelector('#settings-workspace-name').value.trim();
  const errorElement = document.querySelector('#workspace-settings-error');
  if (!name) {
    errorElement.textContent = 'Workspace name cannot be empty.';
    return;
  }
  const button = document.querySelector('#save-workspace-settings');
  setBusy(button, true, 'Saving...');
  errorElement.textContent = '';
  try {
    const { data, error } = await supabase.from('boundary_workspaces')
      .update({ name })
      .eq('id', state.workspace.id)
      .select('id, name')
      .single();
    if (error) throw error;
    state.workspace = data;
    showAuthenticatedShell(state.user, data);
    document.querySelector('#workspace-settings-backdrop').hidden = true;
    setToast('Workspace settings saved.');
  } catch (error) {
    errorElement.textContent = error.message || 'Unable to save workspace settings.';
  } finally {
    setBusy(button, false, 'Saving settings');
  }
}

function openDetails(flowId) {
  const flow = state.flows.find((item) => item.id === flowId);
  if (!flow) return;
  state.selectedFlow = flow;
  const sourceStatus = statusClasses[flow.status] || statusClasses['at-risk'];
  detailContent.innerHTML = `
    <div class="dialog-summary">
      <span class="flow-icon" aria-hidden="true">⌁</span>
      <div><strong>${escapeHtml(flow.name)}</strong><small>${escapeHtml(flow.flow_ref)} · ${escapeHtml(flow.cloud_provider)}</small></div>
      <span class="status-pill ${sourceStatus} dialog-status">${escapeHtml(statusLabels[flow.status] || flow.status)}</span>
    </div>
    <div class="detail-grid">
      <div class="detail-item"><span>SOURCE REGION / JURISDICTION</span><strong>${escapeHtml(flow.source_region)} · ${escapeHtml(flow.source_jurisdiction)}</strong></div>
      <div class="detail-item"><span>DESTINATION REGION / JURISDICTION</span><strong>${escapeHtml(flow.destination_region)} · ${escapeHtml(flow.destination_jurisdiction)}</strong></div>
      <div class="detail-item"><span>DATA CLASSIFICATION</span><strong>${escapeHtml(flow.classification)}</strong></div>
      <div class="detail-item"><span>CLOUD PROVIDER</span><strong>${escapeHtml(flow.cloud_provider)}</strong></div>
      <div class="detail-item"><span>POLICY NAME</span><strong>${escapeHtml(flow.policy_name || 'Not specified')}</strong></div>
      <div class="detail-item"><span>LAST UPDATED</span><strong>${escapeHtml(formatLastSeen(flow.updated_at))}</strong></div>
      <div class="detail-item detail-wide"><span>NOTES</span><strong>${escapeHtml(flow.notes || 'No notes recorded.')}</strong></div>
    </div>
    ${flow.status === 'violation' ? `<div class="policy-message"><span class="policy-check">!</span><span><b>Cross-jurisdiction rule:</b> Sensitive data is recorded moving from ${escapeHtml(flow.source_jurisdiction)} to ${escapeHtml(flow.destination_jurisdiction)}. This finding is calculated in the database; Boundary does not block the transfer.</span></div>` : flow.status === 'at-risk' ? `<div class="policy-message"><span class="policy-check">!</span><span><b>Needs review:</b> The jurisdiction is unknown or an additional review status was recorded. This is not an automated legal compliance determination.</span></div>` : ''}
  `;
  const reviewButton = document.querySelector('#review-flow');
  reviewButton.textContent = flow.reviewed ? 'Reviewed' : 'Mark as reviewed';
  reviewButton.disabled = flow.reviewed || isDemoMode();
  document.querySelector('#edit-flow').hidden = isDemoMode();
  document.querySelector('#delete-flow').hidden = isDemoMode();
  detailDialog.hidden = false;
  document.querySelector('#close-dialog').focus();
}

function openEditor(flow = null) {
  if (isDemoMode()) {
    setToast('The demo workspace is read-only. Sign in to manage your own records.');
    return;
  }
  state.editingFlow = flow;
  document.querySelector('#flow-form-title').textContent = flow ? 'Edit data flow' : 'Add a data flow';
  document.querySelector('#save-flow').textContent = flow ? 'Save changes' : 'Save data flow';
  document.querySelector('#save-flow').dataset.idleText = flow ? 'Save changes' : 'Save data flow';
  document.querySelector('#flow-name').value = flow?.name || '';
  document.querySelector('#flow-provider').value = flow?.cloud_provider || 'AWS';
  document.querySelector('#flow-classification').value = flow?.classification || 'PII';
  document.querySelector('#flow-source').value = flow?.source_region || '';
  document.querySelector('#flow-destination').value = flow?.destination_region || '';
  document.querySelector('#flow-source-jurisdiction').value = flow?.source_jurisdiction === 'UN' ? '' : flow?.source_jurisdiction || '';
  document.querySelector('#flow-destination-jurisdiction').value = flow?.destination_jurisdiction === 'UN' ? '' : flow?.destination_jurisdiction || '';
  document.querySelector('#flow-status').value = flow?.manual_status || 'compliant';
  document.querySelector('#flow-policy').value = flow?.policy_name || '';
  document.querySelector('#flow-notes').value = flow?.notes || '';
  flowFormError.textContent = '';
  detailDialog.hidden = true;
  editorBackdrop.hidden = false;
  document.querySelector('#flow-name').focus();
}

async function saveFlow(event) {
  event.preventDefault();
  if (!state.workspace || isDemoMode()) return;
  setBusy(document.querySelector('#save-flow'), true, 'Saving...');
  flowFormError.textContent = '';
  const form = new FormData(flowForm);
  const payload = {
    workspace_id: state.workspace.id,
    flow_ref: state.editingFlow?.flow_ref || `flow-${crypto.randomUUID().slice(0, 8)}`,
    name: String(form.get('name')).trim(),
    cloud_provider: String(form.get('provider')),
    classification: String(form.get('classification')),
    source_region: String(form.get('sourceRegion')).trim(),
    destination_region: String(form.get('destinationRegion')).trim(),
    source_jurisdiction: String(form.get('sourceJurisdiction')).trim().toUpperCase(),
    destination_jurisdiction: String(form.get('destinationJurisdiction')).trim().toUpperCase(),
    manual_status: String(form.get('manualStatus')),
    policy_name: String(form.get('policyName')).trim(),
    notes: String(form.get('notes')).trim()
  };

  try {
    const request = state.editingFlow
      ? supabase.from('boundary_flows').update(payload).eq('id', state.editingFlow.id).eq('workspace_id', state.workspace.id)
      : supabase.from('boundary_flows').insert(payload);
    const { error } = await request.select('id').single();
    if (error) throw error;
    editorBackdrop.hidden = true;
    flowForm.reset();
    await loadFlows();
    setToast(state.editingFlow ? 'Data flow updated.' : 'Data flow added to your workspace.');
    state.editingFlow = null;
  } catch (error) {
    flowFormError.textContent = error.message || 'Unable to save this data flow.';
  } finally {
    setBusy(document.querySelector('#save-flow'), false, 'Saving...');
  }
}

async function deleteFlow() {
  if (isDemoMode()) return;
  const flow = state.selectedFlow;
  if (!flow || !state.workspace) return;
  if (!window.confirm(`Delete "${flow.name}" from this workspace? This cannot be undone.`)) return;
  const button = document.querySelector('#delete-flow');
  setBusy(button, true, 'Deleting...');
  try {
    const { error } = await supabase
      .from('boundary_flows')
      .delete()
      .eq('id', flow.id)
      .eq('workspace_id', state.workspace.id)
      .select('id')
      .single();
    if (error) throw error;
    detailDialog.hidden = true;
    state.selectedFlow = null;
    await loadFlows();
    setToast('Data flow deleted.');
  } catch (error) {
    setToast(error.message || 'Unable to delete this data flow.', true);
  } finally {
    setBusy(button, false, 'Deleting...');
  }
}

authModeToggle.addEventListener('click', () => {
  setAuthMode(authScreen.dataset.mode === 'signup' ? 'signin' : 'signup');
});

document.querySelector('#demo-login-button').addEventListener('click', createDemoWorkspace);

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const mode = authScreen.dataset.mode;
  const busyText = mode === 'signup' ? 'Creating account...' : mode === 'reset' ? 'Updating password...' : 'Signing in...';
  setBusy(authSubmit, true, busyText);
  setAuthFeedback('');
  const email = document.querySelector('#email').value.trim();
  const password = document.querySelector('#password').value;
  try {
    if (mode === 'signin' && email.toLowerCase() === 'demo' && password === '12345') {
      createDemoWorkspace();
      return;
    }
    if (!supabase) throw new Error('Configure Supabase to use a registered account. The demo login remains available.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Enter a valid work email address.');
    }
    if (password.length < 8 && mode !== 'signin') {
      throw new Error('Password must be at least 8 characters.');
    }
    if (mode === 'reset') {
      if (password !== document.querySelector('#confirm-password').value) {
        throw new Error('The passwords do not match.');
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      state.passwordRecovery = false;
      setAuthFeedback('Password updated. Opening your workspace...');
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      await syncSession(data.session);
    } else if (mode === 'signup') {
      const fullName = document.querySelector('#full-name').value.trim();
      const workspaceName = document.querySelector('#workspace-name').value.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName, workspace_name: workspaceName },
          emailRedirectTo: window.location.origin
        }
      });
      if (error) throw error;
      if (data.session) {
        setAuthFeedback('Account created. Opening your workspace...');
      } else {
        showVerificationScreen(email);
        document.querySelector('#verification-feedback').textContent = 'If registration was accepted, a confirmation link is on its way. You must verify your email before signing in.';
        startVerificationCooldown();
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      setAuthFeedback('Signed in. Opening your workspace...');
    }
  } catch (error) {
    setAuthFeedback(error.message || 'Authentication failed. Please try again.', true);
  } finally {
    setBusy(authSubmit, false, busyText);
  }
});

document.querySelector('#resend-verification').addEventListener('click', async (event) => {
  if (!supabase || !state.verificationEmail) return;
  const button = event.currentTarget;
  const feedback = document.querySelector('#verification-feedback');
  let cooldownStarted = false;
  setBusy(button, true, 'Sending...');
  feedback.textContent = '';
  feedback.classList.remove('error');
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: state.verificationEmail,
      options: { emailRedirectTo: window.location.origin }
    });
    if (error) throw error;
    feedback.textContent = 'If the address can be verified, a new confirmation email is on its way.';
    startVerificationCooldown();
    cooldownStarted = true;
  } catch (error) {
    feedback.textContent = error.message || 'Unable to resend the confirmation email.';
    feedback.classList.add('error');
  } finally {
    if (!cooldownStarted) setBusy(button, false, 'Sending...');
  }
});

document.querySelector('#change-verification-email').addEventListener('click', () => {
  clearInterval(state.verificationTimer);
  state.verificationTimer = null;
  state.verificationEmail = '';
  sessionStorage.removeItem('boundary_verification_email');
  setAuthMode('signup');
  document.querySelector('#email').value = '';
  document.querySelector('#email').focus();
});

document.querySelector('#forgot-password').addEventListener('click', async () => {
  if (!supabase) return;
  const email = document.querySelector('#email').value.trim();
  if (!email) {
    setAuthFeedback('Enter your work email first, then request a password reset.', true);
    document.querySelector('#email').focus();
    return;
  }
  const button = document.querySelector('#forgot-password');
  setBusy(button, true, 'Sending...');
  setAuthFeedback('');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    setAuthFeedback('If an account exists for that email, a password reset link is on its way.');
  } catch (error) {
    setAuthFeedback(error.message || 'Unable to send a password reset email.', true);
  } finally {
    setBusy(button, false, 'Sending...');
  }
});

document.querySelector('#signout-button').addEventListener('click', async () => {
  if (isDemoMode()) {
    state.isDemo = false;
    state.user = null;
    state.workspace = null;
    state.flows = [];
    state.cloudAccounts = [];
    state.cloudScans = [];
    state.cloudResources = [];
    state.selectedFlow = null;
    appShell.hidden = true;
    authScreen.hidden = false;
    document.querySelector('#demo-mode-badge').hidden = true;
    document.querySelector('#demo-banner').hidden = true;
    setAuthMode('signin');
    document.querySelector('#auth-setup-message').hidden = configured;
    return;
  }
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) setToast(error.message || 'Unable to sign out.', true);
});
document.querySelector('#top-avatar').addEventListener('click', () => document.querySelector('#signout-button').click());

document.querySelector('#refresh-button').addEventListener('click', async (event) => {
  if (isDemoMode()) {
    setToast('Demo sample data is static and does not need refreshing.');
    return;
  }
  event.currentTarget.querySelector('.refresh-icon').classList.add('spinning');
  try {
    await loadFlows();
    await loadCloudDataSafely();
    setToast('Workspace data refreshed.');
  } catch (error) {
    setToast(error.message || 'Unable to refresh workspace data.', true);
  } finally {
    setTimeout(() => event.currentTarget.querySelector('.refresh-icon')?.classList.remove('spinning'), 450);
  }
});

document.querySelector('#add-flow-button').addEventListener('click', () => openEditor());
document.querySelector('#add-cloud-account').addEventListener('click', openCloudAccountDialog);
document.querySelector('#cloud-connect-open').addEventListener('click', openCloudAccountDialog);
document.querySelector('#cloud-provider').addEventListener('change', updateFederationInstructions);
document.querySelector('#save-cloud-account').addEventListener('click', saveCloudAccount);
document.querySelector('#close-cloud-account').addEventListener('click', () => {
  document.querySelector('#cloud-account-backdrop').hidden = true;
});
document.querySelector('#cancel-cloud-account').addEventListener('click', () => {
  document.querySelector('#cloud-account-backdrop').hidden = true;
});
document.querySelector('#cloud-account-backdrop').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.hidden = true;
});
document.querySelector('#workspace-settings-open').addEventListener('click', openWorkspaceSettings);
document.querySelector('#workspace-settings-form').addEventListener('submit', saveWorkspaceSettings);
document.querySelector('#close-workspace-settings').addEventListener('click', () => {
  document.querySelector('#workspace-settings-backdrop').hidden = true;
});
document.querySelector('#cancel-workspace-settings').addEventListener('click', () => {
  document.querySelector('#workspace-settings-backdrop').hidden = true;
});
document.querySelector('#workspace-settings-backdrop').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.hidden = true;
});
flowForm.addEventListener('submit', saveFlow);
document.querySelector('#cancel-flow-form').addEventListener('click', () => { editorBackdrop.hidden = true; });
document.querySelector('#close-flow-form').addEventListener('click', () => { editorBackdrop.hidden = true; });
editorBackdrop.addEventListener('click', (event) => {
  if (event.target === editorBackdrop) editorBackdrop.hidden = true;
});

document.addEventListener('click', (event) => {
  const scrollTarget = event.target.closest('[data-scroll]');
  if (scrollTarget) {
    document.getElementById(scrollTarget.dataset.scroll)?.scrollIntoView({ behavior: 'smooth' });
    return;
  }
  const scanButton = event.target.closest('[data-scan-account]');
  if (scanButton) {
    void runCloudScan(scanButton.dataset.scanAccount, scanButton);
    return;
  }
  const removeButton = event.target.closest('[data-remove-account]');
  if (removeButton) {
    void removeCloudAccount(removeButton.dataset.removeAccount);
    return;
  }
  const flowControl = event.target.closest('[data-flow-id]');
  if (flowControl) openDetails(flowControl.dataset.flowId);
});

tableBody.addEventListener('keydown', (event) => {
  if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('tr[data-flow-id]')) {
    event.preventDefault();
    openDetails(event.target.dataset.flowId);
  }
});

searchInput.addEventListener('input', renderFlows);
statusFilter.addEventListener('change', renderFlows);
regionFilter.addEventListener('change', renderFlows);

document.querySelector('#close-dialog').addEventListener('click', () => { detailDialog.hidden = true; });
detailDialog.addEventListener('click', (event) => {
  if (event.target === detailDialog) detailDialog.hidden = true;
});
document.querySelector('#edit-flow').addEventListener('click', () => {
  if (state.selectedFlow) openEditor(state.selectedFlow);
});
document.querySelector('#delete-flow').addEventListener('click', deleteFlow);
document.querySelector('#copy-flow').addEventListener('click', async () => {
  if (!state.selectedFlow) return;
  try {
    await navigator.clipboard.writeText(state.selectedFlow.flow_ref);
    setToast(`Copied ${state.selectedFlow.flow_ref} to clipboard.`);
  } catch {
    setToast(`Flow reference: ${state.selectedFlow.flow_ref}`);
  }
});
document.querySelector('#review-flow').addEventListener('click', async () => {
  const flow = state.selectedFlow;
  if (!flow || flow.reviewed || !state.workspace || isDemoMode()) return;
  const { error } = await supabase.from('boundary_flows')
    .update({ reviewed: true })
    .eq('id', flow.id)
    .eq('workspace_id', state.workspace.id)
    .select('id')
    .single();
  if (error) {
    setToast(error.message || 'Unable to update review status.', true);
    return;
  }
  flow.reviewed = true;
  document.querySelector('#review-flow').textContent = 'Reviewed';
  document.querySelector('#review-flow').disabled = true;
  setToast(`${flow.name} marked as reviewed.`);
});

document.querySelector('#show-violations').addEventListener('click', () => {
  statusFilter.value = 'violation';
  renderFlows();
  document.querySelector('#flows').scrollIntoView({ behavior: 'smooth' });
});
document.querySelector('#tutorial-open').addEventListener('click', openTutorial);
document.querySelector('#tutorial-previous').addEventListener('click', () => {
  if (state.tutorialIndex > 0) {
    state.tutorialIndex -= 1;
    renderTutorialStep();
  }
});
document.querySelector('#tutorial-next').addEventListener('click', () => {
  const step = tutorialSteps[state.tutorialIndex];
  if (step.action === 'add-flow') {
    closeTutorial();
    if (isDemoMode()) setToast('Demo workspace is read-only. Try the sample records and export instead.');
    else openEditor();
  } else if (state.tutorialIndex < tutorialSteps.length - 1) {
    state.tutorialIndex += 1;
    renderTutorialStep();
  } else {
    closeTutorial();
    setToast('You’re ready to start tracking data flows.');
  }
});
document.querySelector('#tutorial-skip').addEventListener('click', () => closeTutorial());
document.querySelector('#tutorial-close').addEventListener('click', () => closeTutorial());
document.querySelector('#tutorial-backdrop').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeTutorial();
});
document.querySelector('#filter-findings').addEventListener('click', () => {
  statusFilter.value = 'violation';
  renderFlows();
  document.querySelector('#flows').scrollIntoView({ behavior: 'smooth' });
});
document.querySelector('#clear-filters').addEventListener('click', () => {
  searchInput.value = '';
  statusFilter.value = 'all';
  regionFilter.value = 'all';
  renderFlows();
});
document.querySelector('.notice-dismiss').addEventListener('click', () => {
  document.querySelector('.demo-notice').remove();
});

document.querySelector('#export-button').addEventListener('click', () => {
  const headers = ['Flow reference', 'Name', 'Source region', 'Source jurisdiction', 'Destination region', 'Destination jurisdiction', 'Classification', 'Provider', 'Status', 'Policy', 'Notes', 'Last updated'];
  const rows = filteredFlows().map((flow) => [
    flow.flow_ref, flow.name, flow.source_region, flow.source_jurisdiction, flow.destination_region, flow.destination_jurisdiction, flow.classification,
    flow.cloud_provider, statusLabels[flow.status], flow.policy_name, flow.notes, flow.updated_at
  ]);
  const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'boundary-data-flows.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  setToast('Filtered workspace records exported.');
});

document.querySelector('#retry-workspace').addEventListener('click', async () => {
  if (!state.user) return;
  try {
    const workspace = await ensureWorkspace(state.user);
    state.workspace = workspace;
    showAuthenticatedShell(state.user, workspace);
    document.querySelector('#workspace-error').hidden = true;
    await loadFlows();
    await loadCloudDataSafely();
  } catch (error) {
    setWorkspaceError(error);
  }
});

document.addEventListener('keydown', (event) => {
  const tutorial = document.querySelector('#tutorial-backdrop');
  if (!tutorial.hidden) {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      document.querySelector('#tutorial-next').click();
    } else if (event.key === 'ArrowLeft' && state.tutorialIndex > 0) {
      event.preventDefault();
      document.querySelector('#tutorial-previous').click();
    } else if (event.key === 'Tab') {
      const focusable = [...tutorial.querySelectorAll('button:not(:disabled)')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  }
  if (event.key === 'Escape') {
    detailDialog.hidden = true;
    editorBackdrop.hidden = true;
    if (!tutorial.hidden) closeTutorial();
  }
});

if (!configured) {
  bootScreen.hidden = true;
  authScreen.hidden = false;
  document.querySelector('#auth-setup-message').hidden = false;
  setAuthMode('signin');
} else {
  setAuthMode(state.passwordRecovery ? 'reset' : 'signup');
  const authError = new URLSearchParams(window.location.search).get('error_description');
  if (authError) setAuthFeedback(`The email link could not be completed: ${authError}`);
  supabase.auth.onAuthStateChange((_event, session) => {
    queueMicrotask(() => {
      if (_event === 'PASSWORD_RECOVERY') state.passwordRecovery = true;
      void syncSession(session);
    });
  });
  supabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    return syncSession(data.session);
  }).catch((error) => {
    bootScreen.hidden = true;
    authScreen.hidden = false;
    setAuthFeedback(error.message || 'Unable to connect to the authentication service.', true);
  });
}

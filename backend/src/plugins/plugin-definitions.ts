export type PluginPlanId = 'free' | 'pro' | 'enterprise';
export type PluginKind = 'core' | 'optional';
export type PluginCategory = 'core' | 'insights' | 'assistant' | 'collaboration';

export interface PluginDefinition {
  id: string;
  title: string;
  description: string;
  category: PluginCategory;
  kind: PluginKind;
  defaultEnabled: boolean;
  implemented: boolean;
  placement: string[];
  requiredPlans?: PluginPlanId[];
}

export const pluginPlans = {
  free: {
    id: 'free',
    title: 'Free',
    description: 'Base wiki experience with mandatory core capabilities.',
  },
  pro: {
    id: 'pro',
    title: 'Pro',
    description: 'Adds knowledge navigation and advanced workspace modules.',
  },
  enterprise: {
    id: 'enterprise',
    title: 'Enterprise',
    description: 'Adds premium automation and AI capabilities.',
  },
} as const;

export const pluginDefinitions: PluginDefinition[] = [
  {
    id: 'live-tables',
    title: 'Live MWS Tables',
    description: 'Core live embeds for existing MWS Tables datasheets inside wiki pages.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['editor:block', 'workspace:content'],
  },
  {
    id: 'backlinks',
    title: 'Backlinks',
    description: 'Core incoming and outgoing page links for wiki navigation.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['workspace:sidebar'],
  },
  {
    id: 'slash-menu',
    title: 'Slash Menu',
    description: 'Core keyboard-first command palette inside the editor.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['editor:slash'],
  },
  {
    id: 'autosave-sync',
    title: 'Autosave & Sync',
    description: 'Core local draft recovery plus backend synchronization.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['editor:autosave'],
  },
  {
    id: 'collaboration',
    title: 'Collaboration',
    description: 'Core collaborative editing and multi-user presence.',
    category: 'core',
    kind: 'core',
    defaultEnabled: true,
    implemented: true,
    placement: ['editor:presence'],
  },
  {
    id: 'document-graph',
    title: 'Document Graph',
    description: 'Visual graph of page relationships in the workspace sidebar.',
    category: 'insights',
    kind: 'optional',
    defaultEnabled: true,
    implemented: true,
    requiredPlans: ['pro', 'enterprise'],
    placement: ['workspace:sidebar'],
  },
  {
    id: 'comments',
    title: 'Comments',
    description: 'Inline discussions and review feedback for wiki documents.',
    category: 'collaboration',
    kind: 'optional',
    defaultEnabled: false,
    implemented: false,
    requiredPlans: ['pro', 'enterprise'],
    placement: ['editor:sidebar'],
  },
  {
    id: 'ai-assist',
    title: 'AI Assist',
    description: 'Contextual AI actions for summarization and drafting help.',
    category: 'assistant',
    kind: 'optional',
    defaultEnabled: false,
    implemented: false,
    requiredPlans: ['enterprise'],
    placement: ['editor:toolbar', 'workspace:assistant'],
  },
];

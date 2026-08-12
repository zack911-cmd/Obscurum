import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Copy, Zap, Brain, Terminal, PenTool, Target, Shield, Bug, FileText,
  Send, Sparkles, ChevronRight, Plus, Minus, Download, Eye,
  Save, History, Star,
  AlertTriangle, Layers,
  Play, Upload, Trash2
} from 'lucide-react';
import { ollamaGenerateOnce, checkOllamaHealth } from '../../lib/ollama';
import AIResponseText from '../shared/AIResponseText';
import { useActiveModel } from '../models/ModelManager';   // ✅ added

interface Finding {
  title: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  description: string;
  impact: string;
  recommendation: string;
  cvss?: string;
  references: string[];
  affectedAssets: string;
  detectionMethod: string;
  remediationTime?: string;
  exploitationComplexity: 'Low' | 'Medium' | 'High';
  proofOfConcept?: string;
}

interface EngagementInfo {
  clientName: string;
  scope: string;
  startDate: string;
  endDate: string;
  testerName: string;
  engagementType: string;
  reportType: string;
  classification: string;
  distribution: string;
  projectId?: string;
  testEnvironment?: string;
  complianceStandard?: string;
}

interface SavedReport {
  id: string;
  timestamp: number;
  name: string;
  markdown: string;
  info: EngagementInfo;
  findings: Finding[];
  template: string;
  favorite?: boolean;
  tags?: string[];
  notes?: string;
}

// Stable id generator
const generateId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

const SEVERITY_COLORS: Record<Finding['severity'], string> = {
  Critical: 'text-red-400 border-red-400/40 bg-red-500/10',
  High: 'text-amber-400 border-amber-400/40 bg-amber-500/10',
  Medium: 'text-cyan-400 border-cyan-400/40 bg-cyan-500/10',
  Low: 'text-blue-400 border-blue-400/40 bg-blue-500/10',
  Informational: 'text-white/40 border-white/20 bg-white/5',
};

const SEVERITY_ORDER: Record<Finding['severity'], number> = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
  Informational: 0,
};

const DEFAULT_FINDING: Finding = {
  title: '',
  severity: 'Medium',
  description: '',
  impact: '',
  recommendation: '',
  cvss: '',
  references: [],
  affectedAssets: '',
  detectionMethod: 'Manual Testing',
  remediationTime: '',
  exploitationComplexity: 'Medium',
  proofOfConcept: '',
};

const ReportWriter: React.FC = () => {
  // ─── ModelManager Integration ──────────────────────────────────────────────
  const activeModel = useActiveModel();
  const [ollamaAvailable, setOllamaAvailable] = useState<boolean | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  // ─── Check Ollama health ────────────────────────────────────────────────────
  useEffect(() => {
    async function checkOllama() {
      try {
        const { ok, version } = await checkOllamaHealth();
        setOllamaAvailable(ok);
        if (!ok) setOllamaError(version ? `Unexpected response` : 'Connection refused');
      } catch {
        setOllamaAvailable(false);
        setOllamaError('Connection refused');
      }
    }
    checkOllama();
  }, []);

  // ─── State ──────────────────────────────────────────────────────────────────
  const [info, setInfo] = useState<EngagementInfo>({
    clientName: '',
    scope: '',
    startDate: '',
    endDate: '',
    testerName: '',
    engagementType: 'Web Application',
    reportType: 'Comprehensive',
    classification: 'Confidential',
    distribution: 'Client Only',
    projectId: '',
    testEnvironment: 'Production',
    complianceStandard: 'N/A',
  });

  const [findings, setFindings] = useState<Finding[]>([{ ...DEFAULT_FINDING }]);
  const [markdown, setMarkdown] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'builder' | 'analyzer' | 'history' | 'templates'>('builder');
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [explanation, setExplanation] = useState<string>('');
  const [template, setTemplate] = useState<string>('standard');
  const [exportFormat, setExportFormat] = useState<'markdown' | 'html'>('markdown');

  const [analyzerInput, setAnalyzerInput] = useState<string>('');
  const [analyzerOutput, setAnalyzerOutput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzerError, setAnalyzerError] = useState<string>('');

  const [savedReports, setSavedReports] = useState<SavedReport[]>(() => {
    try {
      const saved = localStorage.getItem('pentest_reports');
      return saved ? (JSON.parse(saved) as SavedReport[]) : [];
    } catch {
      return [];
    }
  });
  const [reportName, setReportName] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'date' | 'severity' | 'findings'>('date');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);

  const [customTemplates, setCustomTemplates] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('report_templates');
      return saved ? (JSON.parse(saved) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });
  const [templateName, setTemplateName] = useState<string>('');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [showTemplateEditor, setShowTemplateEditor] = useState<boolean>(false);

  const markdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Persistence ────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      localStorage.setItem('pentest_reports', JSON.stringify(savedReports));
    } catch (e) {
      console.error('localStorage write failed (reports):', e);
    }
  }, [savedReports]);

  useEffect(() => {
    try {
      localStorage.setItem('report_templates', JSON.stringify(customTemplates));
    } catch (e) {
      console.error('localStorage write failed (templates):', e);
    }
  }, [customTemplates]);

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleInfoChange = (field: keyof EngagementInfo, value: string) => {
    setInfo((prev) => ({ ...prev, [field]: value }));
  };

  const handleFindingChange = (index: number, field: keyof Finding, value: string | string[]) => {
    setFindings((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value as never };
      return next;
    });
  };

  const addFinding = () => {
    setFindings((prev) => [...prev, { ...DEFAULT_FINDING }]);
  };

  const removeFinding = (index: number) => {
    if (findings.length <= 1) return;
    setFindings((prev) => prev.filter((_, i) => i !== index));
  };

  const generateMarkdown = useCallback((): string => {
    let report = `# Penetration Test Report\n\n`;
    report += `## Engagement Details\n\n`;
    report += `| Field | Value |\n|-------|-------|\n`;
    report += `| Client | ${info.clientName || '[CLIENT NAME]'} |\n`;
    report += `| Project ID | ${info.projectId || '[PROJECT ID]'} |\n`;
    report += `| Scope | ${info.scope || '[SCOPE]'} |\n`;
    report += `| Dates | ${info.startDate || '[START DATE]'} - ${info.endDate || '[END DATE]'} |\n`;
    report += `| Tester | ${info.testerName || '[TESTER NAME]'} |\n`;
    report += `| Type | ${info.engagementType || '[TYPE]'} |\n`;
    report += `| Environment | ${info.testEnvironment || '[ENVIRONMENT]'} |\n`;
    report += `| Classification | ${info.classification || '[CLASSIFICATION]'} |\n`;
    report += `| Distribution | ${info.distribution || '[DISTRIBUTION]'} |\n`;
    report += `| Compliance | ${info.complianceStandard || '[STANDARD]'} |\n\n`;

    const titledFindings = findings.filter((f) => f.title);
    report += `## Executive Summary\n\n`;
    report += `This penetration test was conducted to identify vulnerabilities and security weaknesses in the target environment. `;
    report += `A total of **${titledFindings.length}** findings were identified during the assessment.\n\n`;

    report += `### Severity Breakdown\n\n`;
    const severityCounts: Record<string, number> = {};
    titledFindings.forEach((f) => {
      severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
    });
    report += `| Severity | Count |\n|----------|-------|\n`;
    (['Critical', 'High', 'Medium', 'Low', 'Informational'] as const).forEach((sev) => {
      report += `| ${sev} | ${severityCounts[sev] || 0} |\n`;
    });
    report += '\n';

    report += `## Findings\n\n`;
    titledFindings.forEach((finding, index) => {
      report += `### ${index + 1}. ${finding.title}\n\n`;
      report += `**Severity:** ${finding.severity}\n\n`;
      if (finding.cvss) report += `**CVSS Score:** ${finding.cvss}\n\n`;
      if (finding.exploitationComplexity) report += `**Exploitation Complexity:** ${finding.exploitationComplexity}\n\n`;
      if (finding.remediationTime) report += `**Estimated Remediation Time:** ${finding.remediationTime}\n\n`;
      if (finding.affectedAssets) report += `**Affected Assets:** ${finding.affectedAssets}\n\n`;
      report += `**Description:**\n${finding.description || '[DESCRIPTION]'}\n\n`;
      report += `**Impact:**\n${finding.impact || '[IMPACT]'}\n\n`;
      report += `**Recommendation:**\n${finding.recommendation || '[RECOMMENDATION]'}\n\n`;
      if (finding.proofOfConcept) report += `**Proof of Concept:**\n\`\`\`\n${finding.proofOfConcept}\n\`\`\`\n\n`;
      if (finding.references.length > 0) {
        report += `**References:**\n`;
        finding.references.forEach((ref) => { report += `- ${ref}\n`; });
        report += '\n';
      }
      report += `---\n\n`;
    });

    report += `## Methodology\n\nThe assessment followed a structured methodology:\n\n`;
    report += `1. **Reconnaissance** - Information gathering and target identification\n`;
    report += `2. **Enumeration** - Service and vulnerability discovery\n`;
    report += `3. **Exploitation** - Verification of identified vulnerabilities\n`;
    report += `4. **Post-Exploitation** - Impact assessment and privilege escalation\n`;
    report += `5. **Reporting** - Documentation and remediation guidance\n\n`;

    report += `## Conclusion\n\nThe assessment identified ${titledFindings.length} findings across various severity levels. `;
    report += `Critical and High severity findings should be addressed immediately, while Medium and Low severity issues `;
    report += `should be incorporated into the regular patch cycle.\n\n`;

    report += `## Recommendations Summary\n\n### Immediate Actions (0-7 days)\n`;
    const critical = titledFindings.filter((f) => f.severity === 'Critical');
    report += critical.length ? critical.map((f) => `- ${f.title}`).join('\n') : '- No critical findings identified';
    report += `\n\n### Short-term Actions (7-30 days)\n`;
    const high = titledFindings.filter((f) => f.severity === 'High');
    report += high.length ? high.map((f) => `- ${f.title}`).join('\n') : '- No high findings identified';
    report += `\n\n### Medium-term Actions (30-90 days)\n`;
    const medium = titledFindings.filter((f) => f.severity === 'Medium');
    report += medium.length ? medium.map((f) => `- ${f.title}`).join('\n') : '- No medium findings identified';

    return report;
  }, [info, findings]);

  const generateReport = () => {
    setIsGenerating(true);
    setTimeout(() => {
      setMarkdown(generateMarkdown());
      setIsGenerating(false);
    }, 300);
  };

  const saveReport = () => {
    const name = reportName.trim() || `Report ${savedReports.length + 1}`;
    const newReport: SavedReport = {
      id: generateId(),
      timestamp: Date.now(),
      name,
      markdown: markdown || generateMarkdown(),
      info,
      findings,
      template,
      favorite: false,
      tags: [],
    };
    setSavedReports((prev) => [newReport, ...prev]);
    setCurrentReportId(newReport.id);
    setReportName('');
  };

  const loadReport = (report: SavedReport) => {
    if (markdown && !confirm('Loading will replace the current report. Continue?')) return;
    setInfo(report.info);
    setFindings(report.findings);
    setMarkdown(report.markdown);
    setTemplate(report.template);
    setCurrentReportId(report.id);
    setActiveTab('builder');
  };

  const deleteReport = (id: string) => {
    if (!confirm('Delete this report? This cannot be undone.')) return;
    setSavedReports((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleFavorite = (id: string) => {
    setSavedReports((prev) => prev.map((r) =>
      r.id === id ? { ...r, favorite: !r.favorite } : r
    ));
  };

  const exportReports = () => {
    const data = JSON.stringify(savedReports, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pentest_reports_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importReports = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const raw = e.target?.result;
        if (typeof raw !== 'string') throw new Error('File contents unreadable');
        const data = JSON.parse(raw);
        if (!Array.isArray(data)) throw new Error('Expected an array of reports');

        const valid = data.filter((r: unknown): r is SavedReport => {
          if (!r || typeof r !== 'object') return false;
          const o = r as Partial<SavedReport>;
          return (
            typeof o.id === 'string' &&
            typeof o.timestamp === 'number' &&
            typeof o.name === 'string' &&
            typeof o.markdown === 'string' &&
            typeof o.info === 'object' &&
            Array.isArray(o.findings)
          );
        });

        if (valid.length === 0) {
          alert('No valid report entries found in file.');
          return;
        }
        setSavedReports((prev) => [...valid, ...prev]);
        alert(`Imported ${valid.length} report(s).`);
      } catch (err) {
        console.error('Import error:', err);
        alert(`Invalid file format: ${(err as Error).message}`);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const clearAllReports = () => {
    if (!confirm(`Delete ALL ${savedReports.length} saved reports? This cannot be undone.`)) return;
    setSavedReports([]);
  };

  // ─── Memoized stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = savedReports.length;
    const favorited = savedReports.filter((r) => r.favorite).length;
    const totalFindings = savedReports.reduce(
      (sum, r) => sum + r.findings.filter((f) => f.title).length, 0
    );
    const bySeverity = {
      Critical: 0, High: 0, Medium: 0, Low: 0, Informational: 0,
    } as Record<Finding['severity'], number>;
    savedReports.forEach((r) => {
      r.findings.forEach((f) => {
        if (f.title) bySeverity[f.severity] += 1;
      });
    });
    return { total, favorited, totalFindings, bySeverity };
  }, [savedReports]);

  // ─── Copy to clipboard ────────────────────────────────────────────────────
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = markdown;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  };

  // ─── AI Functions (now use activeModel & check availability) ──────────
  const explainWithAI = async () => {
    if (!markdown) {
      setExplanation('Generate a report first before requesting AI analysis.');
      return;
    }
    if (!ollamaAvailable) {
      setExplanation(`⚠️ Ollama is not running (${ollamaError || 'connection failed'}). Please start Ollama and try again.`);
      return;
    }
    setIsExplaining(true);
    setExplanation('');
    const controller = new AbortController();
    try {
      const model = activeModel || 'llama3.2';  // fallback
      const text = await ollamaGenerateOnce(
        model,
        `Analyze this pentest report structure and provide a concise 3-4 sentence executive summary and key recommendations:\n\n${markdown.slice(0, 2000)}`,
        { temperature: 0.5 },
        controller.signal,
      );
      setExplanation(text || 'Analysis complete.');
    } catch (error) {
      console.error('Explain error:', error);
      setExplanation(
        "This pentest report follows industry standards with executive summary, detailed findings, and remediation advice. Each finding includes severity rating and CVSS score where applicable."
      );
    } finally {
      setIsExplaining(false);
    }
  };

  const analyzeWithAI = async () => {
    if (!analyzerInput.trim()) {
      setAnalyzerError('Please enter some content to analyze');
      return;
    }
    if (!ollamaAvailable) {
      setAnalyzerError(`⚠️ Ollama is not running (${ollamaError || 'connection failed'}). Please start Ollama and try again.`);
      return;
    }
    setIsAnalyzing(true);
    setAnalyzerError('');
    setAnalyzerOutput('');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const model = activeModel || 'llama3.2';
      const text = await ollamaGenerateOnce(
        model,
        `Analyze this pentest report content and provide:
1. Critical vulnerabilities identified
2. Risk assessment summary
3. Immediate remediation steps
4. Additional tools to use

Content: ${analyzerInput}`,
        { temperature: 0.55 },
        controller.signal,
      );
      if (!text) throw new Error('Invalid response format from AI service');
      setAnalyzerOutput(text);
    } catch (error) {
      const e = error as Error & { name?: string };
      console.error('AI Analysis Error:', e);
      if (e.name === 'AbortError' || /abort/i.test(e.message)) {
        setAnalyzerError('Connection timeout – ensure Ollama is running and the active model is available');
      } else if (/failed to fetch|networkerror/i.test(e.message)) {
        setAnalyzerError('Could not connect to Ollama service. Make sure it is running.');
      } else {
        setAnalyzerError(`Analysis failed: ${e.message}`);
      }
    } finally {
      clearTimeout(timeoutId);
      setIsAnalyzing(false);
    }
  };

  // ─── Export ──────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!markdown) {
      alert('Nothing to export — generate a report first.');
      return;
    }
    let content = markdown;
    let mime = 'text/markdown';
    let ext = 'md';

    if (exportFormat === 'html') {
      const escaped = markdown
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      content = `<!doctype html><html><head><meta charset="utf-8"><title>Pentest Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;margin:2rem auto;padding:0 1rem;line-height:1.6}
pre{background:#0b0b0b;color:#d0d0d0;padding:1rem;border-radius:6px;overflow:auto}
code{background:#f4f4f4;padding:0.1em 0.3em;border-radius:3px}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border:1px solid #ccc;padding:0.5rem;text-align:left}
h1,h2,h3{color:#0e7490}</style></head>
<body><pre>${escaped}</pre></body></html>`;
      mime = 'text/html';
      ext = 'html';
    }

    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(reportName || 'pentest_report').replace(/[^a-z0-9-_]+/gi, '_')}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Templates ────────────────────────────────────────────────────────────
  const saveCustomTemplate = () => {
    if (!templateName.trim() || !templateContent.trim()) return;
    setCustomTemplates((prev) => ({ ...prev, [templateName]: templateContent }));
    setTemplateName('');
    setTemplateContent('');
    setShowTemplateEditor(false);
  };

  const deleteCustomTemplate = (name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;
    setCustomTemplates((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const applyCustomTemplate = (name: string) => {
    const tpl = customTemplates[name];
    if (!tpl) return;
    const next = markdown
      ? `${markdown}\n\n---\n\n${tpl}`
      : tpl;
    setMarkdown(next);
    setTemplate(name);
  };

  // ─── Filtered reports ────────────────────────────────────────────────────
  const filteredReports = useMemo(() => {
    return savedReports
      .filter((r) => {
        if (filterSeverity !== 'All' && !r.findings.some((f) => f.severity === filterSeverity && f.title)) {
          return false;
        }
        const term = searchTerm.trim().toLowerCase();
        if (term) {
          const hay = `${r.name} ${r.info.clientName} ${r.notes ?? ''}`.toLowerCase();
          if (!hay.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date') return b.timestamp - a.timestamp;
        if (sortBy === 'severity') {
          const worst = (r: SavedReport) =>
            r.findings.reduce((m, f) => Math.max(m, SEVERITY_ORDER[f.severity] ?? 0), 0);
          return worst(b) - worst(a);
        }
        const count = (r: SavedReport) => r.findings.filter((f) => f.title).length;
        return count(b) - count(a);
      });
  }, [savedReports, filterSeverity, searchTerm, sortBy]);

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full overflow-y-auto" style={{ background: 'linear-gradient(135deg, #090b14 0%, #0d1022 50%, #090b14 100%)' }}>
      
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-white/5 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center border border-amber-500/20" style={{ background: 'radial-gradient(circle, rgba(251,191,36,0.18), rgba(251,191,36,0.04))' }}>
            <PenTool size={16} className="text-amber-400" />
          </div>
          <div>
            <span className="text-white font-bold text-base">Scribe</span>
            <div className="text-white/40 text-xs flex items-center gap-2 flex-wrap">
              Professional pentest reports with AI assistance
              {/* Ollama status indicator */}
              <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${
                ollamaAvailable === true ? 'border-emerald-500/30 text-emerald-400/70' : 'border-red-500/30 text-red-400/70'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${ollamaAvailable === true ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
                {ollamaAvailable === true ? `Online · ${activeModel || 'No model'}` : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === 'history'
                ? 'border-amber-500/30 text-amber-400 bg-amber-500/10'
                : 'border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
            }`}
          >
            <History size={12} />
            History {savedReports.length > 0 && `(${savedReports.length})`}
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              activeTab === 'templates'
                ? 'border-purple-500/30 text-purple-400 bg-purple-500/10'
                : 'border-white/10 text-white/50 hover:text-white/80 hover:border-white/20'
            }`}
          >
            <Layers size={12} />
            Templates
          </button>
        </div>
      </div>

      {/* ── Ollama offline warning ── */}
      {ollamaAvailable === false && (
        <div className="mx-8 mt-4 p-3 rounded-xl border border-red-500/20 bg-red-500/5 flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle size={13} /> Ollama is not running at {process.env.OLLAMA_HOST || 'http://127.0.0.1:11434'}. AI features are disabled.
        </div>
      )}

      {/* ── Main Content ── */}
      <div className="px-8 py-6 max-w-6xl mx-auto">

        {/* ── Tabs ── */}
        <div className="flex gap-1 mb-6 flex-wrap">
          {(['builder', 'analyzer', 'history', 'templates'] as const).map(tab => {
            const icons = {
              builder: <FileText size={14} />,
              analyzer: <Brain size={14} />,
              history: <History size={14} />,
              templates: <Layers size={14} />
            };
            const labels = {
              builder: 'Report Builder',
              analyzer: 'AI Analyzer',
              history: 'History',
              templates: 'Templates'
            };
            const colors = {
              builder: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
              analyzer: 'border-purple-500/30 text-purple-400 bg-purple-500/10',
              history: 'border-amber-500/30 text-amber-400 bg-amber-500/10',
              templates: 'border-purple-500/30 text-purple-400 bg-purple-500/10'
            };
            const defaultStyle = 'text-white/40 hover:text-white/80 border-white/5 hover:border-white/20';
            
            return (
              <button
                key={tab}
                className={`px-4 py-2 text-xs font-mono rounded-xl transition-colors flex items-center gap-1.5 border ${
                  activeTab === tab ? colors[tab] : defaultStyle
                }`}
                onClick={() => setActiveTab(tab)}
              >
                {icons[tab]} {labels[tab]}
                {tab === 'history' && savedReports.length > 0 && (
                  <span className="text-[10px] bg-amber-500/20 px-1.5 py-0.5 rounded-full text-amber-400">
                    {savedReports.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Stats Bar */}
        {savedReports.length > 0 && activeTab === 'builder' && (
          <div className="mb-6 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs font-mono">
            <div className="bg-white/5 border border-white/5 rounded-xl p-3 text-center">
              <div className="text-white/40">Reports</div>
              <div className="text-amber-400 font-bold text-lg">{stats.total}</div>
            </div>
            <div className="bg-white/5 border border-yellow-400/20 rounded-xl p-3 text-center">
              <div className="text-yellow-400/60">Favorited</div>
              <div className="text-yellow-400 font-bold text-lg">{stats.favorited}</div>
            </div>
            <div className="bg-white/5 border border-amber-400/20 rounded-xl p-3 text-center">
              <div className="text-amber-400/60">Findings</div>
              <div className="text-amber-400 font-bold text-lg">{stats.totalFindings}</div>
            </div>
            <div className="bg-white/5 border border-red-400/20 rounded-xl p-3 text-center">
              <div className="text-red-400/60">Critical</div>
              <div className="text-red-400 font-bold text-lg">{stats.bySeverity.Critical}</div>
            </div>
            <div className="bg-white/5 border border-amber-400/20 rounded-xl p-3 text-center">
              <div className="text-amber-400/60">High</div>
              <div className="text-amber-400 font-bold text-lg">{stats.bySeverity.High}</div>
            </div>
          </div>
        )}

        {/* ── BUILDER TAB ── */}
        {activeTab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
              <h2 className="text-sm font-bold mb-4 text-amber-400 flex items-center gap-2">
                <Target size={16} /> Engagement Information
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-white/40 font-mono mb-1">Client Name</label>
                  <input type="text" value={info.clientName}
                    onChange={(e) => handleInfoChange('clientName', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                    placeholder="Acme Corporation" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 font-mono mb-1">Project ID</label>
                  <input type="text" value={info.projectId}
                    onChange={(e) => handleInfoChange('projectId', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                    placeholder="PENTEST-2024-001" />
                </div>
                <div>
                  <label className="block text-xs text-white/40 font-mono mb-1">Scope</label>
                  <input type="text" value={info.scope}
                    onChange={(e) => handleInfoChange('scope', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                    placeholder="192.168.1.0/24, example.com" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/40 font-mono mb-1">Start Date</label>
                    <input type="date" value={info.startDate}
                      onChange={(e) => handleInfoChange('startDate', e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 font-mono mb-1">End Date</label>
                    <input type="date" value={info.endDate}
                      onChange={(e) => handleInfoChange('endDate', e.target.value)}
                      min={info.startDate || undefined}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-white/40 font-mono mb-1">Tester Name</label>
                  <input type="text" value={info.testerName}
                    onChange={(e) => handleInfoChange('testerName', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                    placeholder="John PenTester" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/40 font-mono mb-1">Engagement Type</label>
                    <select value={info.engagementType}
                      onChange={(e) => handleInfoChange('engagementType', e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30">
                      <option style={{ background: '#0d1022' }}>Web Application</option>
                      <option style={{ background: '#0d1022' }}>Network</option>
                      <option style={{ background: '#0d1022' }}>Internal</option>
                      <option style={{ background: '#0d1022' }}>External</option>
                      <option style={{ background: '#0d1022' }}>Red Team</option>
                      <option style={{ background: '#0d1022' }}>Mobile Application</option>
                      <option style={{ background: '#0d1022' }}>Cloud Assessment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 font-mono mb-1">Environment</label>
                    <select value={info.testEnvironment}
                      onChange={(e) => handleInfoChange('testEnvironment', e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30">
                      <option style={{ background: '#0d1022' }}>Production</option>
                      <option style={{ background: '#0d1022' }}>Staging</option>
                      <option style={{ background: '#0d1022' }}>Development</option>
                      <option style={{ background: '#0d1022' }}>QA/Test</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white/40 font-mono mb-1">Compliance Standard</label>
                  <select value={info.complianceStandard}
                    onChange={(e) => handleInfoChange('complianceStandard', e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30">
                    <option style={{ background: '#0d1022' }}>N/A</option>
                    <option style={{ background: '#0d1022' }}>PCI DSS</option>
                    <option style={{ background: '#0d1022' }}>HIPAA</option>
                    <option style={{ background: '#0d1022' }}>ISO 27001</option>
                    <option style={{ background: '#0d1022' }}>SOC 2</option>
                    <option style={{ background: '#0d1022' }}>GDPR</option>
                    <option style={{ background: '#0d1022' }}>NIST SP 800-53</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/40 font-mono mb-1">Classification</label>
                    <select value={info.classification}
                      onChange={(e) => handleInfoChange('classification', e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30">
                      <option style={{ background: '#0d1022' }}>Confidential</option>
                      <option style={{ background: '#0d1022' }}>Internal Use</option>
                      <option style={{ background: '#0d1022' }}>Public</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 font-mono mb-1">Distribution</label>
                    <select value={info.distribution}
                      onChange={(e) => handleInfoChange('distribution', e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30">
                      <option style={{ background: '#0d1022' }}>Client Only</option>
                      <option style={{ background: '#0d1022' }}>Management Team</option>
                      <option style={{ background: '#0d1022' }}>Technical Staff</option>
                      <option style={{ background: '#0d1022' }}>All Stakeholders</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-white/40 font-mono mb-1">Report Template</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['standard', 'compliance', 'executive', 'technical'] as const).map((t) => (
                      <button key={t}
                        className={`p-2 rounded-xl border text-left text-sm capitalize transition-colors ${
                          template === t ? 'border-amber-500/30 bg-amber-500/10 text-amber-400' : 'border-white/10 text-white/40 hover:text-white/80'
                        }`}
                        onClick={() => setTemplate(t)}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <h2 className="text-sm font-bold mt-6 mb-4 text-amber-400 flex items-center gap-2">
                <Bug size={16} /> Findings
              </h2>

              <div className="space-y-4">
                {findings.map((finding, index) => (
                  <div key={index} className="bg-black/30 border border-white/5 rounded-xl p-4">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-medium text-white text-sm">Finding #{index + 1}</h3>
                      <button onClick={() => removeFinding(index)} className="text-red-400 hover:text-red-300 transition-colors">
                        <Minus size={16} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs text-white/40 font-mono mb-1">Title</label>
                        <input type="text" value={finding.title}
                          onChange={(e) => handleFindingChange(index, 'title', e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                          placeholder="SQL Injection in Login Form" />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-white/40 font-mono mb-1">Severity</label>
                          <select value={finding.severity}
                            onChange={(e) => handleFindingChange(index, 'severity', e.target.value as Finding['severity'])}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-amber-500/30">
                            {(['Critical', 'High', 'Medium', 'Low', 'Informational'] as const).map((s) => (
                              <option key={s} value={s} style={{ background: '#0d1022' }}>{s}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-white/40 font-mono mb-1">CVSS Score</label>
                          <input type="text" value={finding.cvss ?? ''}
                            onChange={(e) => handleFindingChange(index, 'cvss', e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                            placeholder="7.5" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-white/40 font-mono mb-1">Exploitation Complexity</label>
                          <select value={finding.exploitationComplexity}
                            onChange={(e) => handleFindingChange(index, 'exploitationComplexity', e.target.value as Finding['exploitationComplexity'])}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30">
                            {(['Low', 'Medium', 'High'] as const).map((c) => (
                              <option key={c} value={c} style={{ background: '#0d1022' }}>{c}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-white/40 font-mono mb-1">Remediation Time</label>
                          <input type="text" value={finding.remediationTime ?? ''}
                            onChange={(e) => handleFindingChange(index, 'remediationTime', e.target.value)}
                            className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                            placeholder="2 hours" />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-white/40 font-mono mb-1">Affected Assets</label>
                        <input type="text" value={finding.affectedAssets}
                          onChange={(e) => handleFindingChange(index, 'affectedAssets', e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                          placeholder="server01.example.com, 192.168.1.100" />
                      </div>

                      <div>
                        <label className="block text-xs text-white/40 font-mono mb-1">Detection Method</label>
                        <select value={finding.detectionMethod}
                          onChange={(e) => handleFindingChange(index, 'detectionMethod', e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30">
                          <option style={{ background: '#0d1022' }}>Manual Testing</option>
                          <option style={{ background: '#0d1022' }}>Automated Scan</option>
                          <option style={{ background: '#0d1022' }}>Hybrid Approach</option>
                          <option style={{ background: '#0d1022' }}>Fuzzing</option>
                          <option style={{ background: '#0d1022' }}>Code Review</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs text-white/40 font-mono mb-1">Description</label>
                        <textarea value={finding.description}
                          onChange={(e) => handleFindingChange(index, 'description', e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                          rows={3} placeholder="Detailed technical description of the vulnerability..." />
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 font-mono mb-1">Impact</label>
                        <textarea value={finding.impact}
                          onChange={(e) => handleFindingChange(index, 'impact', e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                          rows={2} placeholder="What can an attacker achieve..." />
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 font-mono mb-1">Recommendation</label>
                        <textarea value={finding.recommendation}
                          onChange={(e) => handleFindingChange(index, 'recommendation', e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                          rows={2} placeholder="How to fix or mitigate the issue..." />
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 font-mono mb-1">Proof of Concept</label>
                        <textarea value={finding.proofOfConcept ?? ''}
                          onChange={(e) => handleFindingChange(index, 'proofOfConcept', e.target.value)}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                          rows={2} placeholder="curl -X POST ..." />
                      </div>
                      <div>
                        <label className="block text-xs text-white/40 font-mono mb-1">References (one per line)</label>
                        <textarea
                          value={finding.references.join('\n')}
                          onChange={(e) => handleFindingChange(index, 'references',
                            e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))}
                          className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                          rows={2} placeholder="CVE-2023-12345&#10;https://example.com/advisory" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={addFinding} className="mt-4 flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors text-sm">
                <Plus size={16} /> Add Finding
              </button>

              <div className="mt-4">
                <label className="block text-xs text-white/40 font-mono mb-1">Report Name (optional)</label>
                <input type="text" value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                  placeholder="My Pentest Report" />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button onClick={generateReport} disabled={isGenerating}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(90deg, #d97706, #f59e0b)' }}>
                  {isGenerating ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Generating...</>
                    : <><Zap size={16} />Generate Report</>}
                </button>
                <button onClick={saveReport} disabled={!markdown || isGenerating}
                  className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-4 py-2.5 rounded-xl hover:bg-emerald-500/30 border border-emerald-500/30 disabled:opacity-40 transition-colors text-sm">
                  <Save size={16} />Save Report
                </button>
                <button onClick={explainWithAI} disabled={isExplaining || !markdown || !ollamaAvailable}
                  className="flex items-center gap-2 bg-purple-500/20 text-purple-400 px-4 py-2.5 rounded-xl hover:bg-purple-500/30 border border-purple-500/30 disabled:opacity-40 transition-colors text-sm">
                  {isExplaining ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>Analyzing...</>
                    : <><Brain size={16} />Explain with AI</>}
                </button>
              </div>

              {explanation && (
                <div className="mt-4 p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl">
                  <div className="flex items-start gap-2">
                    <Sparkles className="text-purple-400 mt-1 flex-shrink-0" size={16} />
                    <div>
                      <h3 className="font-medium text-purple-400 text-sm">AI Explanation</h3>
                      <AIResponseText text={explanation} className="text-white/60 text-sm mt-1" />
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <select value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as 'markdown' | 'html')}
                  className="bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white/80 text-sm focus:outline-none focus:border-amber-500/30">
                  <option value="markdown" style={{ background: '#0d1022' }}>Markdown (.md)</option>
                  <option value="html" style={{ background: '#0d1022' }}>HTML (.html)</option>
                </select>
                <button onClick={handleExport} disabled={!markdown}
                  className="flex items-center gap-2 bg-emerald-500/20 text-emerald-400 px-4 py-2.5 rounded-xl hover:bg-emerald-500/30 border border-emerald-500/30 disabled:opacity-40 transition-colors text-sm">
                  <Download size={16} />Export
                </button>
              </div>
            </div>

            {/* Right Panel */}
            <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                  <Terminal size={16} /> Generated Report
                </h2>
                <button onClick={copyToClipboard} disabled={!markdown}
                  className="flex items-center gap-1 text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-xl border border-white/10 disabled:opacity-40 transition-colors text-white/40 hover:text-white/80">
                  <Copy size={12} />Copy
                </button>
              </div>

              <div
                ref={markdownRef}
                className="bg-black/30 text-emerald-400 font-mono text-sm p-4 rounded-xl border border-white/5 whitespace-pre-wrap max-h-[600px] overflow-auto"
              >
                {markdown || '# Penetration Test Report\n\nReport will appear here after generation...'}
              </div>

              <div className="mt-6">
                <h3 className="font-medium text-amber-400 mb-3 text-sm">Severity Distribution</h3>
                <div className="space-y-2">
                  {(Object.keys(SEVERITY_COLORS) as Finding['severity'][]).map((severity) => {
                    const count = findings.filter((f) => f.severity === severity && f.title).length;
                    const total = findings.filter((f) => f.title).length;
                    const percentage = total ? Math.round((count / total) * 100) : 0;
                    const colorClass = SEVERITY_COLORS[severity].replace('text', 'bg');
                    return (
                      <div key={severity} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-white/40">{severity}</div>
                        <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                          <div className={`h-full ${colorClass}`} style={{ width: `${percentage}%` }} />
                        </div>
                        <div className="w-10 text-xs text-white/40 text-right">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-medium text-amber-400 mb-2 text-sm flex items-center gap-2">
                  <Shield size={16} className="text-amber-400" /> Report Structure
                </h3>
                <ul className="text-xs text-white/40 space-y-1">
                  {['Engagement Details', 'Executive Summary', 'Detailed Findings (with severity ratings)',
                    'Methodology', 'Conclusion & Recommendations'].map((s) => (
                    <li key={s} className="flex items-center gap-2">
                      <ChevronRight size={12} className="text-amber-400" />{s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── ANALYZER TAB ── */}
        {activeTab === 'analyzer' && (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
            <h2 className="text-sm font-bold mb-4 text-amber-400 flex items-center gap-2">
              <Brain size={16} /> AI Report Analyzer
            </h2>
            <p className="text-white/40 text-sm mb-6">
              Paste your pentest findings or scan results for AI-powered analysis and recommendations.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs text-white/40 font-mono mb-2">Paste Report Content</label>
                <textarea value={analyzerInput}
                  onChange={(e) => setAnalyzerInput(e.target.value)}
                  className="w-full h-64 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-emerald-400 font-mono text-sm focus:outline-none focus:border-amber-500/30 placeholder-white/20"
                  placeholder="Paste your pentest findings, Nmap output, or vulnerability scan results here..." />
                {analyzerError && (
                  <div className="mt-2 p-2 bg-red-500/5 border border-red-500/20 rounded-xl text-red-400 text-xs">
                    {analyzerError}
                  </div>
                )}
                <button onClick={analyzeWithAI} disabled={isAnalyzing || !ollamaAvailable}
                  className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-white text-sm transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(90deg, #d97706, #f59e0b)' }}>
                  {isAnalyzing ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>Analyzing...</>
                    : <><Send size={16} />Analyze with AI</>}
                </button>
                <div className="mt-4 text-xs text-white/30 space-y-1">
                  <p className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>Ensure Ollama is running on localhost:11434</p>
                  <p className="flex items-center gap-2"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400"></span>Active model: <strong>{activeModel || 'llama3.2 (fallback)'}</strong></p>
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/40 font-mono mb-2">Analysis Results</label>
                <div className="h-64 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/60 font-mono text-sm overflow-auto">
                  {analyzerOutput ? (
                    <AIResponseText text={analyzerOutput} className="whitespace-pre-wrap" />
                  ) : isAnalyzing ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mx-auto mb-3"></div>
                        <p className="text-white/40 text-sm">Analyzing with {activeModel || 'llama3.2 (fallback)'}...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-white/30 mt-16">
                      <Brain className="mx-auto mb-3" size={28} />
                      <p className="text-sm">AI analysis results will appear here</p>
                      <p className="text-xs mt-1 text-white/20">Paste content and click "Analyze with AI"</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="font-medium text-white/60 mb-3 text-sm flex items-center gap-2"><Eye size={16} /> Analysis Capabilities</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { t: 'Vulnerability Assessment', d: 'Identifies critical vulnerabilities and their business impact' },
                  { t: 'Risk Prioritization', d: 'Prioritizes risks based on severity and exploitability' },
                  { t: 'Remediation Guidance', d: 'Provides actionable steps to mitigate identified risks' },
                ].map((c) => (
                  <div key={c.t} className="bg-black/30 p-4 rounded-xl border border-white/5">
                    <h4 className="font-medium text-amber-400 mb-2 text-sm">{c.t}</h4>
                    <p className="text-xs text-white/40">{c.d}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── HISTORY TAB ── */}
        {activeTab === 'history' && (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
              <h2 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                <History size={16} /> Saved Reports
                <span className="text-xs font-normal text-white/40 ml-1">({savedReports.length} reports)</span>
              </h2>
              <div className="flex gap-2 flex-wrap">
                <input type="text" value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search reports..."
                  className="bg-black/30 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white/60 focus:outline-none focus:border-amber-500/30 placeholder-white/20 w-32 sm:w-48" />
                <select value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}
                  className="bg-black/30 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white/60 focus:outline-none focus:border-amber-500/30">
                  <option value="All" style={{ background: '#0d1022' }}>All Severities</option>
                  <option value="Critical" style={{ background: '#0d1022' }}>Critical</option>
                  <option value="High" style={{ background: '#0d1022' }}>High</option>
                  <option value="Medium" style={{ background: '#0d1022' }}>Medium</option>
                  <option value="Low" style={{ background: '#0d1022' }}>Low</option>
                  <option value="Informational" style={{ background: '#0d1022' }}>Informational</option>
                </select>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as 'date' | 'severity' | 'findings')}
                  className="bg-black/30 border border-white/10 rounded-xl px-2 py-1.5 text-xs text-white/60 focus:outline-none focus:border-amber-500/30">
                  <option value="date" style={{ background: '#0d1022' }}>Sort by Date</option>
                  <option value="severity" style={{ background: '#0d1022' }}>Sort by Severity</option>
                  <option value="findings" style={{ background: '#0d1022' }}>Sort by Findings</option>
                </select>
                <button onClick={exportReports} disabled={savedReports.length === 0}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-cyan-400 transition-colors px-2 py-1 border border-white/10 rounded-xl disabled:opacity-40">
                  <Download size={12} /> Export
                </button>
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-white/40 hover:text-cyan-400 transition-colors px-2 py-1 border border-white/10 rounded-xl">
                  <Upload size={12} /> Import
                </button>
                <input ref={fileInputRef} type="file" accept=".json" onChange={importReports} className="hidden" />
                <button onClick={clearAllReports} disabled={savedReports.length === 0}
                  className="flex items-center gap-1 text-xs text-red-400/50 hover:text-red-400 transition-colors px-2 py-1 border border-red-500/20 rounded-xl disabled:opacity-40">
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <div className="text-center py-12">
                <FileText size={40} className="text-white/20 mx-auto mb-3" />
                <p className="text-white/40">No saved reports found</p>
                <p className="text-white/20 text-sm mt-1">Generate and save a report to see it here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredReports.map((report) => {
                  const findingCount = report.findings.filter((f) => f.title).length;
                  return (
                    <div key={report.id} className={`bg-white/5 border rounded-xl p-4 transition-all ${currentReportId === report.id ? 'border-amber-500/30' : 'border-white/5 hover:border-amber-500/20'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button onClick={() => loadReport(report)}
                              className="text-amber-400 hover:text-amber-300 font-mono font-bold text-sm transition-colors">
                              {report.name}
                            </button>
                            <span className="text-white/30 text-xs">•</span>
                            <span className="text-white/40 text-xs">{report.info.clientName || 'No client'}</span>
                            <span className="text-white/30 text-xs">•</span>
                            <span className="text-white/40 text-xs">{new Date(report.timestamp).toLocaleString()}</span>
                            {report.favorite && <Star size={12} className="text-yellow-400" />}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-white/40">{findingCount} findings</span>
                            <span className="text-white/20 text-xs">•</span>
                            <span className="text-xs text-white/40">{report.template}</span>
                            {report.findings.some((f) => f.severity === 'Critical' && f.title) && (
                              <span className="text-xs text-red-400 flex items-center gap-1">
                                <AlertTriangle size={10} /> Critical
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button onClick={() => toggleFavorite(report.id)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-yellow-400 transition-colors" title="Toggle favorite">
                            <Star size={14} className={report.favorite ? 'text-yellow-400' : ''} />
                          </button>
                          <button onClick={() => loadReport(report)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-amber-400 transition-colors" title="Load report">
                            <Play size={14} />
                          </button>
                          <button onClick={() => deleteReport(report.id)}
                            className="p-1.5 rounded-lg text-white/30 hover:text-red-400 transition-colors" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TEMPLATES TAB ── */}
        {activeTab === 'templates' && (
          <div className="bg-white/5 border border-white/5 rounded-2xl p-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
              <h2 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                <Layers size={16} /> Report Templates
              </h2>
              <button onClick={() => setShowTemplateEditor(!showTemplateEditor)}
                className="flex items-center gap-2 bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 px-4 py-2 rounded-xl border border-purple-500/30 transition-colors text-sm">
                <Plus size={16} />{showTemplateEditor ? 'Close' : 'New Template'}
              </button>
            </div>

            {showTemplateEditor && (
              <div className="mb-6 p-4 bg-black/30 border border-white/5 rounded-xl">
                <h3 className="font-medium text-purple-400 mb-3 text-sm">Create Custom Template</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-white/40 font-mono mb-1">Template Name</label>
                    <input type="text" value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white/80 text-sm focus:outline-none focus:border-purple-500/30 placeholder-white/20"
                      placeholder="My Custom Template" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/40 font-mono mb-1">Template Content (Markdown)</label>
                    <textarea value={templateContent}
                      onChange={(e) => setTemplateContent(e.target.value)}
                      className="w-full h-40 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-emerald-400 font-mono text-sm focus:outline-none focus:border-purple-500/30 placeholder-white/20"
                      placeholder="# My Report Template&#10;&#10;## Introduction&#10;&#10;## Findings&#10;&#10;## Recommendations" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveCustomTemplate} disabled={!templateName.trim() || !templateContent.trim()}
                      className="bg-purple-500/20 text-purple-400 px-4 py-2 rounded-xl hover:bg-purple-500/30 border border-purple-500/30 disabled:opacity-40 transition-colors text-sm">
                      Save Template
                    </button>
                    <button onClick={() => { setShowTemplateEditor(false); setTemplateName(''); setTemplateContent(''); }}
                      className="bg-white/5 text-white/40 px-4 py-2 rounded-xl hover:bg-white/10 border border-white/10 transition-colors text-sm">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(customTemplates).map(([name, content]) => (
                <div key={name} className="bg-black/30 rounded-xl p-4 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-purple-400 text-sm">{name}</h3>
                    <div className="flex gap-1">
                      <button onClick={() => applyCustomTemplate(name)}
                        className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 rounded transition-colors">Apply</button>
                      <button onClick={() => deleteCustomTemplate(name)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded transition-colors">Delete</button>
                    </div>
                  </div>
                  <p className="text-white/40 text-xs truncate">{content.slice(0, 100)}...</p>
                </div>
              ))}
            </div>

            {Object.keys(customTemplates).length === 0 && !showTemplateEditor && (
              <div className="text-center py-12">
                <Layers size={40} className="text-white/20 mx-auto mb-3" />
                <p className="text-white/40">No custom templates yet</p>
                <p className="text-white/20 text-sm mt-1">Create your first template to get started</p>
              </div>
            )}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        .animate-bounce { animation: bounce 1.2s ease-in-out infinite; }
      `}} />
    </div>
  );
};

export default ReportWriter;
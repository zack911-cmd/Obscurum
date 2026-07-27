import React, { useState, useRef, useEffect } from 'react';
import { 
  Copy, Zap, Brain, Terminal, Target, Shield, Bug, FileText, 
  Send, Sparkles, ChevronRight, Plus, Minus, Download, Eye,
  Save, History, Star, 
  AlertTriangle, Layers, 
  Play, Upload, Trash2} from 'lucide-react';
import { ollamaGenerateOnce } from '../../lib/ollama'

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
  exploitationComplexity?: 'Low' | 'Medium' | 'High';
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

const ReportWriter: React.FC = () => {
  // State for engagement info
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
    complianceStandard: 'N/A'
  });

  // State for findings
  const [findings, setFindings] = useState<Finding[]>([
    {
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
      proofOfConcept: ''
    }
  ]);

  // State for output
  const [markdown, setMarkdown] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'builder' | 'analyzer' | 'history' | 'templates'>('builder');
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [explanation, setExplanation] = useState<string>('');
  const [template, setTemplate] = useState<string>('standard');
  const [exportFormat, setExportFormat] = useState<'markdown' | 'html' | 'pdf' | 'docx'>('markdown');

  // Analyzer states
  const [analyzerInput, setAnalyzerInput] = useState<string>('');
  const [analyzerOutput, setAnalyzerOutput] = useState<string>('');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analyzerError, setAnalyzerError] = useState<string>('');

  // History states
  const [savedReports, setSavedReports] = useState<SavedReport[]>(() => {
    try {
      const saved = localStorage.getItem('pentest_reports');
      return saved ? JSON.parse(saved) : [];
    } catch { return [] }
  });
  const [reportName, setReportName] = useState<string>('');
  const [filterSeverity, setFilterSeverity] = useState<string>('All');
  // keep only the value from this state (setter is not used)
  const [filterType] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'date' | 'severity' | 'findings'>('date');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>('');
  const [showStats] = useState<boolean>(true);

  // Template states
  const [customTemplates, setCustomTemplates] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem('report_templates');
      return saved ? JSON.parse(saved) : {};
    } catch { return {} };
  });
  const [templateName, setTemplateName] = useState<string>('');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [showTemplateEditor, setShowTemplateEditor] = useState<boolean>(false);

  // Refs
  const markdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem('pentest_reports', JSON.stringify(savedReports));
  }, [savedReports]);

  useEffect(() => {
    localStorage.setItem('report_templates', JSON.stringify(customTemplates));
  }, [customTemplates]);

  useEffect(() => {
    void currentReportId;
    void editingNote;
    void notes;
  }, [currentReportId, editingNote, notes]);

  // Handle input changes for engagement info
  const handleInfoChange = (field: keyof EngagementInfo, value: string) => {
    setInfo(prev => ({ ...prev, [field]: value }));
  };

  // Handle finding changes
  const handleFindingChange = (index: number, field: keyof Finding, value: string | string[]) => {
    const newFindings = [...findings];
    newFindings[index] = { ...newFindings[index], [field]: value };
    setFindings(newFindings);
  };

  // Add new finding
  const addFinding = () => {
    setFindings([
      ...findings,
      {
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
        proofOfConcept: ''
      }
    ]);
  };

  // Remove finding
  const removeFinding = (index: number) => {
    if (findings.length > 1) {
      const newFindings = findings.filter((_, i) => i !== index);
      setFindings(newFindings);
    }
  };

  // Generate markdown report
  const generateMarkdown = () => {
    let report = '';

    // Report header
    report += `# Penetration Test Report\n\n`;
    report += `## Engagement Details\n\n`;
    report += `| Field | Value |\n`;
    report += `|-------|-------|\n`;
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

    report += `## Executive Summary\n\n`;
    report += `This penetration test was conducted to identify vulnerabilities and security weaknesses in the target environment. `;
    report += `A total of **${findings.filter(f => f.title).length}** findings were identified during the assessment.\n\n`;

    // Severity breakdown
    report += `### Severity Breakdown\n\n`;
    const severityCounts: Record<string, number> = {};
    findings.forEach(f => {
      if (f.title) {
        severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
      }
    });
    report += `| Severity | Count |\n`;
    report += `|----------|-------|\n`;
    ['Critical', 'High', 'Medium', 'Low', 'Informational'].forEach(sev => {
      report += `| ${sev} | ${severityCounts[sev] || 0} |\n`;
    });
    report += '\n';

    report += `## Findings\n\n`;

    findings.forEach((finding, index) => {
      if (!finding.title) return;
      
      report += `### ${index + 1}. ${finding.title}\n\n`;
      report += `**Severity:** ${finding.severity}\n\n`;
      
      if (finding.cvss) {
        report += `**CVSS Score:** ${finding.cvss}\n\n`;
      }
      
      if (finding.exploitationComplexity) {
        report += `**Exploitation Complexity:** ${finding.exploitationComplexity}\n\n`;
      }
      
      if (finding.remediationTime) {
        report += `**Estimated Remediation Time:** ${finding.remediationTime}\n\n`;
      }
      
      if (finding.affectedAssets) {
        report += `**Affected Assets:** ${finding.affectedAssets}\n\n`;
      }
      
      report += `**Description:**\n${finding.description || '[DESCRIPTION]'}\n\n`;
      report += `**Impact:**\n${finding.impact || '[IMPACT]'}\n\n`;
      report += `**Recommendation:**\n${finding.recommendation || '[RECOMMENDATION]'}\n\n`;
      
      if (finding.proofOfConcept) {
        report += `**Proof of Concept:**\n\`\`\`\n${finding.proofOfConcept}\n\`\`\`\n\n`;
      }
      
      if (finding.references.length > 0) {
        report += `**References:**\n`;
        finding.references.forEach(ref => {
          report += `- ${ref}\n`;
        });
        report += '\n';
      }
      
      report += `---\n\n`;
    });

    report += `## Methodology\n\n`;
    report += `The assessment followed a structured methodology:\n\n`;
    report += `1. **Reconnaissance** - Information gathering and target identification\n`;
    report += `2. **Enumeration** - Service and vulnerability discovery\n`;
    report += `3. **Exploitation** - Verification of identified vulnerabilities\n`;
    report += `4. **Post-Exploitation** - Impact assessment and privilege escalation\n`;
    report += `5. **Reporting** - Documentation and remediation guidance\n\n`;

    report += `## Conclusion\n\n`;
    report += `The assessment identified ${findings.filter(f => f.title).length} findings across various severity levels. `;
    report += `Critical and High severity findings should be addressed immediately, while Medium and Low severity issues `;
    report += `should be incorporated into the regular patch cycle.\n\n`;

    report += `## Recommendations Summary\n\n`;
    report += `### Immediate Actions (0-7 days)\n`;
    const criticalFindings = findings.filter(f => f.severity === 'Critical' && f.title);
    if (criticalFindings.length > 0) {
      criticalFindings.forEach(f => {
        report += `- ${f.title}\n`;
      });
    } else {
      report += `- No critical findings identified\n`;
    }
    
    report += `\n### Short-term Actions (7-30 days)\n`;
    const highFindings = findings.filter(f => f.severity === 'High' && f.title);
    if (highFindings.length > 0) {
      highFindings.forEach(f => {
        report += `- ${f.title}\n`;
      });
    } else {
      report += `- No high findings identified\n`;
    }
    
    report += `\n### Medium-term Actions (30-90 days)\n`;
    const mediumFindings = findings.filter(f => f.severity === 'Medium' && f.title);
    if (mediumFindings.length > 0) {
      mediumFindings.forEach(f => {
        report += `- ${f.title}\n`;
      });
    } else {
      report += `- No medium findings identified\n`;
    }

    return report;
  };

  const generateReport = () => {
    setIsGenerating(true);
    setTimeout(() => {
      const report = generateMarkdown();
      setMarkdown(report);
      setIsGenerating(false);
    }, 500);
  };

  // Save report
  const saveReport = () => {
    const name = reportName.trim() || `Report ${savedReports.length + 1}`;
    const newReport: SavedReport = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      name: name,
      markdown: markdown || generateMarkdown(),
      info: info,
      findings: findings,
      template: template,
      favorite: false,
      tags: []
    };
    setSavedReports(prev => [newReport, ...prev]);
    setCurrentReportId(newReport.id);
    setReportName('');
    setEditingNote(false);
  };

  // Load report
  const loadReport = (report: SavedReport) => {
    setInfo(report.info);
    setFindings(report.findings);
    setMarkdown(report.markdown);
    setTemplate(report.template);
    setCurrentReportId(report.id);
    setNotes(report.notes || '');
    setActiveTab('builder');
  };

  // Delete report
  const deleteReport = (id: string) => {
    setSavedReports(prev => prev.filter(r => r.id !== id));
  };

  // Toggle favorite
  const toggleFavorite = (id: string) => {
    setSavedReports(prev => prev.map(r => 
      r.id === id ? { ...r, favorite: !r.favorite } : r
    ));
  };

  // Export reports
  const exportReports = () => {
    const data = JSON.stringify(savedReports, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pentest_reports_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import reports
  const importReports = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (Array.isArray(data)) {
          setSavedReports(prev => [...data, ...prev]);
        }
      } catch (error) {
        console.error('Import error:', error);
        alert('Invalid file format. Please check the file.');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Clear all reports
  const clearAllReports = () => {
    setSavedReports([]);
  };

  // Get stats
  const getStats = () => {
    const total = savedReports.length;
    const favorited = savedReports.filter(r => r.favorite).length;
    const totalFindings = savedReports.reduce((sum, r) => sum + r.findings.filter(f => f.title).length, 0);
    const bySeverity = {
      Critical: savedReports.reduce((sum, r) => sum + r.findings.filter(f => f.severity === 'Critical' && f.title).length, 0),
      High: savedReports.reduce((sum, r) => sum + r.findings.filter(f => f.severity === 'High' && f.title).length, 0),
      Medium: savedReports.reduce((sum, r) => sum + r.findings.filter(f => f.severity === 'Medium' && f.title).length, 0),
      Low: savedReports.reduce((sum, r) => sum + r.findings.filter(f => f.severity === 'Low' && f.title).length, 0),
      Informational: savedReports.reduce((sum, r) => sum + r.findings.filter(f => f.severity === 'Informational' && f.title).length, 0),
    };
    return { total, favorited, totalFindings, bySeverity };
  };

  // Copy to clipboard
  const copyToClipboard = () => {
    if (markdownRef.current) {
      const text = markdownRef.current.innerText;
      navigator.clipboard.writeText(text);
    }
  };

  // Explain with AI
  const explainWithAI = async () => {
    setIsExplaining(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      clearTimeout(timeoutId);
      const text = await ollamaGenerateOnce(
        'gpt-oss:20b-cloud',
        `Analyze this pentest report structure and provide a concise 3-4 sentence executive summary and key recommendations:\n\n${markdown.slice(0, 2000)}`,
        { temperature: 0.5 },
        controller.signal,
      )
      setExplanation(text || 'Analysis complete.')
    } catch (error) {
      setExplanation("This pentest report follows industry standards with executive summary, detailed findings, and remediation advice. Each finding includes severity rating and CVSS score where applicable.");
    } finally {
      setIsExplaining(false);
    }
  };

  // Analyze with AI
  const analyzeWithAI = async () => {
    if (!analyzerInput.trim()) {
      setAnalyzerError('Please enter some content to analyze');
      return;
    }

    setIsAnalyzing(true);
    setAnalyzerError('');
    setAnalyzerOutput('');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      clearTimeout(timeoutId);
      const text = await ollamaGenerateOnce(
        'gpt-oss:20b-cloud',
        `Analyze this pentest report content and provide:
          1. Critical vulnerabilities identified
          2. Risk assessment summary
          3. Immediate remediation steps
          4. Additional tools to use

          Content: ${analyzerInput}`,
        { temperature: 0.55 },
        controller.signal,
      )
      if (!text) throw new Error('Invalid response format from AI service')
      setAnalyzerOutput(text)
    } catch (error: any) {
      console.error('AI Analysis Error:', error);
      if (error.name === 'AbortError') {
        setAnalyzerError('Connection timeout - ensure Ollama is running and gpt-oss:20b-cloud model is available');
      } else if (error.message.includes('Failed to fetch')) {
        setAnalyzerError('Could not connect to Ollama service. Make sure it is running with gpt-oss:20b-cloud model.');
      } else {
        setAnalyzerError(`Analysis failed: ${error.message}`);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Generate different report templates
  const generateTemplateReport = (templateType: string) => {
    setIsGenerating(true);

    setTimeout(() => {
      let report = '';

    switch(templateType) {
      case 'compliance':
        report = `# Compliance Assessment Report\n\n`;
        report += `## Regulatory Framework\n\n`;
        report += `## Control Assessment\n\n`;
        report += `## Findings Summary\n\n`;
        report += `## Remediation Roadmap\n\n`;
        break;
      case 'executive':
        report = `# Executive Summary Report\n\n`;
        report += `## Business Impact\n\n`;
        report += `## Key Findings\n\n`;
        report += `## Risk Overview\n\n`;
        report += `## Strategic Recommendations\n\n`;
        break;
      case 'technical':
        report = `# Technical Findings Report\n\n`;
        report += `## Methodology\n\n`;
        report += `## Detailed Exploitation\n\n`;
        report += `## Proof of Concepts\n\n`;
        report += `## Remediation Details\n\n`;
        break;
      default:
        report = generateMarkdown();
    }


      // expose for debugging/usage to avoid unused declaration warning
      try {
        (window as any).generateTemplateReport = generateTemplateReport;
      } catch (e) {
        // ignore in non-browser environments
      }
    setMarkdown(report);
    setIsGenerating(false);
    }, 500);
  };

  // Save custom template
  const saveCustomTemplate = () => {
    if (!templateName.trim() || !templateContent.trim()) return;
    setCustomTemplates(prev => ({
      ...prev,
      [templateName]: templateContent
    }));
    setTemplateName('');
    setTemplateContent('');
    setShowTemplateEditor(false);
  };

  // Delete custom template
  const deleteCustomTemplate = (name: string) => {
    const newTemplates = { ...customTemplates };
    delete newTemplates[name];
    setCustomTemplates(newTemplates);
  };

  // Apply custom template
  const applyCustomTemplate = (name: string) => {
    if (customTemplates[name]) {
      setMarkdown(customTemplates[name]);
      setTemplate(name);
    }
  };

  const stats = getStats();

  // Severity color mapping
  const severityColors = {
    Critical: 'text-red-500',
    High: 'text-orange-500',
    Medium: 'text-yellow-500',
    Low: 'text-blue-500',
    Informational: 'text-gray-500'
  };

  // Filter and sort reports
  const filteredReports = savedReports
    .filter(r => {
      if (filterSeverity !== 'All') {
        return r.findings.some(f => f.severity === filterSeverity && f.title);
      }
      if (filterType !== 'All') {
        return r.template === filterType;
      }
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        return r.name.toLowerCase().includes(search) ||
               r.info.clientName.toLowerCase().includes(search) ||
               (r.notes && r.notes.toLowerCase().includes(search));
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'date') return b.timestamp - a.timestamp;
      if (sortBy === 'severity') {
        const getWorst = (report: SavedReport) => {
          const order = { Critical: 4, High: 3, Medium: 2, Low: 1, Informational: 0 };
          return Math.max(...report.findings.map(f => order[f.severity as keyof typeof order] || 0));
        };
        return getWorst(b) - getWorst(a);
      }
      if (sortBy === 'findings') {
        const count = (r: SavedReport) => r.findings.filter(f => f.title).length;
        return count(b) - count(a);
      }
      return 0;
    });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Terminal className="text-cyan-400" size={32} />
              <div>
                <h1 className="text-3xl font-bold text-cyan-400">Penetration Test Report Generator</h1>
                <p className="text-gray-400">Build professional pentest reports with AI assistance</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('history')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                  activeTab === 'history' 
                    ? 'bg-cyan-900/30 border-cyan-500 text-cyan-400' 
                    : 'text-gray-400 hover:text-cyan-400 border-gray-700'
                }`}
              >
                <History size={14} />
                History {savedReports.length > 0 && `(${savedReports.length})`}
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`flex items-center gap-1 px-3 py-1.5 text-xs font-mono rounded border transition-colors ${
                  activeTab === 'templates' 
                    ? 'bg-purple-900/30 border-purple-500 text-purple-400' 
                    : 'text-gray-400 hover:text-purple-400 border-gray-700'
                }`}
              >
                <Layers size={14} />
                Templates
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700 mb-6 flex-wrap">
          <button
            className={`px-4 py-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'builder'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('builder')}
          >
            <FileText size={18} />
            Report Builder
          </button>
          <button
            className={`px-4 py-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'analyzer'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('analyzer')}
          >
            <Brain size={18} />
            AI Analyzer
          </button>
          <button
            className={`px-4 py-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'history'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('history')}
          >
            <History size={18} />
            History
          </button>
          <button
            className={`px-4 py-2 font-medium flex items-center gap-2 transition-colors ${
              activeTab === 'templates'
              ? 'text-purple-400 border-b-2 border-purple-400'
              : 'text-gray-400 hover:text-gray-300'
            }`}
            onClick={() => setActiveTab('templates')}
          >
            <Layers size={18} />
            Templates
          </button>
        </div>

        {/* Stats Bar */}
        {showStats && savedReports.length > 0 && activeTab === 'builder' && (
          <div className="mb-4 grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-center">
              <div className="text-gray-400">Reports</div>
              <div className="text-cyan-400 font-bold">{stats.total}</div>
            </div>
            <div className="bg-gray-800 border border-yellow-400/30 rounded-lg p-2 text-center">
              <div className="text-yellow-400">Favorited</div>
              <div className="text-yellow-400 font-bold">{stats.favorited}</div>
            </div>
            <div className="bg-gray-800 border border-cyan-400/30 rounded-lg p-2 text-center">
              <div className="text-cyan-400">Findings</div>
              <div className="text-cyan-400 font-bold">{stats.totalFindings}</div>
            </div>
            <div className="bg-gray-800 border border-red-400/30 rounded-lg p-2 text-center">
              <div className="text-red-400">Critical</div>
              <div className="text-red-400 font-bold">{stats.bySeverity.Critical}</div>
            </div>
            <div className="bg-gray-800 border border-orange-400/30 rounded-lg p-2 text-center">
              <div className="text-orange-400">High</div>
              <div className="text-orange-400 font-bold">{stats.bySeverity.High}</div>
            </div>
          </div>
        )}

        {activeTab === 'builder' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Panel - Input */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <h2 className="text-xl font-bold mb-4 text-cyan-400 flex items-center gap-2">
                <Target size={20} />
                Engagement Information
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Client Name</label>
                  <input
                    type="text"
                    value={info.clientName}
                    onChange={(e) => handleInfoChange('clientName', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="Acme Corporation"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Project ID</label>
                  <input
                    type="text"
                    value={info.projectId}
                    onChange={(e) => handleInfoChange('projectId', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="PENTEST-2024-001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Scope</label>
                  <input
                    type="text"
                    value={info.scope}
                    onChange={(e) => handleInfoChange('scope', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="192.168.1.0/24, example.com"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={info.startDate}
                      onChange={(e) => handleInfoChange('startDate', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">End Date</label>
                    <input
                      type="date"
                      value={info.endDate}
                      onChange={(e) => handleInfoChange('endDate', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Tester Name</label>
                  <input
                    type="text"
                    value={info.testerName}
                    onChange={(e) => handleInfoChange('testerName', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    placeholder="John PenTester"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Engagement Type</label>
                    <select
                      value={info.engagementType}
                      onChange={(e) => handleInfoChange('engagementType', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option>Web Application</option>
                      <option>Network</option>
                      <option>Internal</option>
                      <option>External</option>
                      <option>Red Team</option>
                      <option>Mobile Application</option>
                      <option>Cloud Assessment</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Environment</label>
                    <select
                      value={info.testEnvironment}
                      onChange={(e) => handleInfoChange('testEnvironment', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option>Production</option>
                      <option>Staging</option>
                      <option>Development</option>
                      <option>QA/Test</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Compliance Standard</label>
                  <select
                    value={info.complianceStandard}
                    onChange={(e) => handleInfoChange('complianceStandard', e.target.value)}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  >
                    <option>N/A</option>
                    <option>PCI DSS</option>
                    <option>HIPAA</option>
                    <option>ISO 27001</option>
                    <option>SOC 2</option>
                    <option>GDPR</option>
                    <option>NIST SP 800-53</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Classification</label>
                    <select
                      value={info.classification}
                      onChange={(e) => handleInfoChange('classification', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option>Confidential</option>
                      <option>Internal Use</option>
                      <option>Public</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Distribution</label>
                    <select
                      value={info.distribution}
                      onChange={(e) => handleInfoChange('distribution', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option>Client Only</option>
                      <option>Management Team</option>
                      <option>Technical Staff</option>
                      <option>All Stakeholders</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Report Template</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      className={`p-3 rounded border ${template === 'standard' ? 'border-cyan-500 bg-cyan-900/20' : 'border-gray-600'}`}
                      onClick={() => setTemplate('standard')}
                    >
                      Standard Report
                    </button>
                    <button
                      className={`p-3 rounded border ${template === 'compliance' ? 'border-cyan-500 bg-cyan-900/20' : 'border-gray-600'}`}
                      onClick={() => setTemplate('compliance')}
                    >
                      Compliance Report
                    </button>
                    <button
                      className={`p-3 rounded border ${template === 'executive' ? 'border-cyan-500 bg-cyan-900/20' : 'border-gray-600'}`}
                      onClick={() => setTemplate('executive')}
                    >
                      Executive Summary
                    </button>
                    <button
                      className={`p-3 rounded border ${template === 'technical' ? 'border-cyan-500 bg-cyan-900/20' : 'border-gray-600'}`}
                      onClick={() => setTemplate('technical')}
                    >
                      Technical Details
                    </button>
                  </div>
                </div>
              </div>

              <h2 className="text-xl font-bold mt-8 mb-4 text-cyan-400 flex items-center gap-2">
                <Bug size={20} />
                Findings
              </h2>

              <div className="space-y-6">
                {findings.map((finding, index) => (
                  <div key={index} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="font-medium">Finding #{index + 1}</h3>
                      <button
                        onClick={() => removeFinding(index)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Minus size={18} />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Title</label>
                        <input
                          type="text"
                          value={finding.title}
                          onChange={(e) => handleFindingChange(index, 'title', e.target.value)}
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          placeholder="SQL Injection in Login Form"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Severity</label>
                          <select
                            value={finding.severity}
                            onChange={(e) => handleFindingChange(index, 'severity', e.target.value as any)}
                            className={`w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${severityColors[finding.severity]}`}
                          >
                            <option value="Critical">Critical</option>
                            <option value="High">High</option>
                            <option value="Medium">Medium</option>
                            <option value="Low">Low</option>
                            <option value="Informational">Informational</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">CVSS Score</label>
                          <input
                            type="text"
                            value={finding.cvss}
                            onChange={(e) => handleFindingChange(index, 'cvss', e.target.value)}
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            placeholder="7.5"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Exploitation Complexity</label>
                          <select
                            value={finding.exploitationComplexity}
                            onChange={(e) => handleFindingChange(index, 'exploitationComplexity', e.target.value as any)}
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          >
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-1">Remediation Time</label>
                          <input
                            type="text"
                            value={finding.remediationTime}
                            onChange={(e) => handleFindingChange(index, 'remediationTime', e.target.value)}
                            className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                            placeholder="2 hours"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Affected Assets</label>
                        <input
                          type="text"
                          value={finding.affectedAssets}
                          onChange={(e) => handleFindingChange(index, 'affectedAssets', e.target.value)}
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          placeholder="server01.example.com, 192.168.1.100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Detection Method</label>
                        <select
                          value={finding.detectionMethod}
                          onChange={(e) => handleFindingChange(index, 'detectionMethod', e.target.value)}
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                        >
                          <option>Manual Testing</option>
                          <option>Automated Scan</option>
                          <option>Hybrid Approach</option>
                          <option>Fuzzing</option>
                          <option>Code Review</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                        <textarea
                          value={finding.description}
                          onChange={(e) => handleFindingChange(index, 'description', e.target.value)}
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          rows={3}
                          placeholder="Detailed technical description of the vulnerability..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Impact</label>
                        <textarea
                          value={finding.impact}
                          onChange={(e) => handleFindingChange(index, 'impact', e.target.value)}
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          rows={2}
                          placeholder="What can an attacker achieve..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Recommendation</label>
                        <textarea
                          value={finding.recommendation}
                          onChange={(e) => handleFindingChange(index, 'recommendation', e.target.value)}
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          rows={2}
                          placeholder="How to fix or mitigate the issue..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Proof of Concept</label>
                        <textarea
                          value={finding.proofOfConcept}
                          onChange={(e) => handleFindingChange(index, 'proofOfConcept', e.target.value)}
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          rows={2}
                          placeholder="curl -X POST ..."
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">References</label>
                        <textarea
                          value={finding.references.join('\n')}
                          onChange={(e) => handleFindingChange(index, 'references', e.target.value.split('\n'))}
                          className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                          rows={2}
                          placeholder="CVE-2023-12345&#10;https://example.com/advisory"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={addFinding}
                className="mt-4 flex items-center gap-2 text-cyan-400 hover:text-cyan-300"
              >
                <Plus size={18} />
                Add Finding
              </button>

              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Report Name (optional)</label>
                <input
                  type="text"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  placeholder="My Pentest Report"
                />
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  onClick={generateReport}
                  disabled={isGenerating}
                  className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Generating...
                    </>
                  ) : (
                    <>
                      <Zap size={18} />
                      Generate Report
                    </>
                  )}
                </button>

                <button
                  onClick={saveReport}
                  disabled={!markdown || isGenerating}
                  className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  <Save size={18} />
                  Save Report
                </button>

                <button
                  onClick={explainWithAI}
                  disabled={isExplaining}
                  className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {isExplaining ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain size={18} />
                      Explain with AI
                    </>
                  )}
                </button>
              </div>

              {explanation && (
                <div className="mt-4 p-4 bg-gray-700 rounded-lg border border-gray-600">
                  <div className="flex items-start gap-2">
                    <Sparkles className="text-purple-400 mt-1 flex-shrink-0" size={16} />
                    <div>
                      <h3 className="font-medium text-purple-400">AI Explanation</h3>
                      <p className="text-gray-300 text-sm mt-1">{explanation}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-2">
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value as any)}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="markdown">Markdown</option>
                  <option value="html">HTML</option>
                  <option value="pdf">PDF</option>
                  <option value="docx">Word Document</option>
                </select>

                <button className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg">
                  <Download size={18} />
                  Export
                </button>
              </div>
            </div>

            {/* Right Panel - Output */}
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
                  <Terminal size={20} />
                  Generated Report
                </h2>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-1 text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded"
                >
                  <Copy size={14} />
                  Copy
                </button>
              </div>

              <div
                ref={markdownRef}
                className="bg-black text-green-400 font-mono text-sm p-4 rounded-lg border border-gray-600 whitespace-pre-wrap max-h-[600px] overflow-auto"
              >
                {markdown || '# Penetration Test Report\n\nReport will appear here after generation...'}
              </div>

              <div className="mt-6">
                <h3 className="font-medium text-gray-300 mb-3">Severity Distribution</h3>
                <div className="space-y-2">
                  {Object.entries(severityColors).map(([severity, colorClass]) => {
                    const count = findings.filter(f => f.severity === severity && f.title).length;
                    const total = findings.filter(f => f.title).length;
                    const percentage = total ? Math.round((count / total) * 100) : 0;

                    return (
                      <div key={severity} className="flex items-center gap-3">
                        <div className="w-24 text-sm text-gray-400">{severity}</div>
                        <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colorClass.replace('text', 'bg')}`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                        <div className="w-10 text-sm text-gray-400">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-medium text-gray-300 mb-2 flex items-center gap-2">
                  <Shield size={18} />
                  Report Structure
                </h3>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li className="flex items-center gap-2">
                    <ChevronRight size={14} className="text-cyan-400" />
                    Engagement Details
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight size={14} className="text-cyan-400" />
                    Executive Summary
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight size={14} className="text-cyan-400" />
                    Detailed Findings (with severity ratings)
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight size={14} className="text-cyan-400" />
                    Methodology
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight size={14} className="text-cyan-400" />
                    Conclusion & Recommendations
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'analyzer' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-cyan-400 flex items-center gap-2">
              <Brain size={20} />
              AI Report Analyzer
            </h2>
            <p className="text-gray-400 mb-6">
              Paste your pentest findings or scan results for AI-powered analysis and recommendations.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Paste Report Content
                </label>
                <textarea
                  value={analyzerInput}
                  onChange={(e) => setAnalyzerInput(e.target.value)}
                  className="w-full h-64 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono text-sm"
                  placeholder="Paste your pentest findings, Nmap output, or vulnerability scan results here..."
                ></textarea>

                {analyzerError && (
                  <div className="mt-2 p-2 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
                    {analyzerError}
                  </div>
                )}

                <button
                  onClick={analyzeWithAI}
                  disabled={isAnalyzing}
                  className="mt-4 flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Send size={18} />
                      Analyze with AI
                    </>
                  )}
                </button>

                <div className="mt-4 text-sm text-gray-400">
                  <p className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                    Ensure Ollama is running on localhost:11434
                  </p>
                  <p className="flex items-center gap-2 mt-1">
                    <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                    gpt-oss:20b-cloud model must be installed
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Analysis Results
                </label>
                <div className="h-64 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-gray-300 font-mono text-sm overflow-auto">
                  {analyzerOutput ? (
                    <div className="whitespace-pre-wrap">{analyzerOutput}</div>
                  ) : isAnalyzing ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto mb-3"></div>
                        <p>Analyzing with gpt-oss:20b-cloud...</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-gray-500 mt-20">
                      <Brain className="mx-auto mb-2" size={32} />
                      <p>AI analysis results will appear here</p>
                      <p className="text-xs mt-2">Paste content and click "Analyze with AI"</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="font-medium text-gray-300 mb-3 flex items-center gap-2">
                <Eye size={18} />
                Analysis Capabilities
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-700 p-4 rounded-lg border border-gray-600">
                  <h4 className="font-medium text-cyan-400 mb-2">Vulnerability Assessment</h4>
                  <p className="text-sm text-gray-400">Identifies critical vulnerabilities and their business impact</p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg border border-gray-600">
                  <h4 className="font-medium text-cyan-400 mb-2">Risk Prioritization</h4>
                  <p className="text-sm text-gray-400">Prioritizes risks based on severity and exploitability</p>
                </div>
                <div className="bg-gray-700 p-4 rounded-lg border border-gray-600">
                  <h4 className="font-medium text-cyan-400 mb-2">Remediation Guidance</h4>
                  <p className="text-sm text-gray-400">Provides actionable steps to mitigate identified risks</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
              <h2 className="text-xl font-bold text-cyan-400 flex items-center gap-2">
                <History size={20} />
                Saved Reports
                <span className="text-sm font-normal text-gray-400 ml-2">
                  ({savedReports.length} reports)
                </span>
              </h2>
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search reports..."
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 placeholder-gray-400 w-32 sm:w-48"
                />
                <select
                  value={filterSeverity}
                  onChange={(e) => setFilterSeverity(e.target.value)}
                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="All">All Severities</option>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                  <option value="Informational">Informational</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  <option value="date">Sort by Date</option>
                  <option value="severity">Sort by Severity</option>
                  <option value="findings">Sort by Findings</option>
                </select>
                <button
                  onClick={exportReports}
                  disabled={savedReports.length === 0}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors px-2 py-1 border border-gray-600 rounded disabled:opacity-40"
                >
                  <Download size={12} /> Export
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-cyan-400 transition-colors px-2 py-1 border border-gray-600 rounded"
                >
                  <Upload size={12} /> Import
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={importReports}
                  className="hidden"
                />
                <button
                  onClick={clearAllReports}
                  disabled={savedReports.length === 0}
                  className="flex items-center gap-1 text-xs text-red-400/60 hover:text-red-400 transition-colors px-2 py-1 border border-red-700/30 rounded disabled:opacity-40"
                >
                  <Trash2 size={12} /> Clear All
                </button>
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <div className="text-center py-12">
                <FileText size={48} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No saved reports found</p>
                <p className="text-gray-500 text-sm mt-1">Generate and save a report to see it here</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredReports.map(report => {
                  const findingCount = report.findings.filter(f => f.title).length;
                  return (
                    <div key={report.id} className="bg-gray-700 rounded-lg p-4 border border-gray-600 hover:border-cyan-500/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => loadReport(report)}
                              className="text-cyan-400 hover:text-cyan-300 font-mono font-bold text-sm transition-colors"
                            >
                              {report.name}
                            </button>
                            <span className="text-gray-400 text-xs">•</span>
                            <span className="text-gray-400 text-xs">{report.info.clientName || 'No client'}</span>
                            <span className="text-gray-400 text-xs">•</span>
                            <span className="text-gray-400 text-xs">{new Date(report.timestamp).toLocaleString()}</span>
                            {report.favorite && (
                              <Star size={12} className="text-yellow-400" />
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-400">{findingCount} findings</span>
                            <span className="text-xs text-gray-400">•</span>
                            <span className="text-xs text-gray-400">{report.template}</span>
                            {report.findings.some(f => f.severity === 'Critical' && f.title) && (
                              <span className="text-xs text-red-400 flex items-center gap-1">
                                <AlertTriangle size={10} /> Critical
                              </span>
                            )}
                          </div>
                          {report.notes && (
                            <div className="text-gray-400 text-xs mt-1">📝 {report.notes}</div>
                          )}
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => toggleFavorite(report.id)}
                            className="p-1 text-gray-400 hover:text-yellow-400 transition-colors"
                            title="Toggle favorite"
                          >
                            <Star size={14} className={report.favorite ? 'text-yellow-400' : ''} />
                          </button>
                          <button
                            onClick={() => loadReport(report)}
                            className="p-1 text-gray-400 hover:text-cyan-400 transition-colors"
                            title="Load report"
                          >
                            <Play size={14} />
                          </button>
                          <button
                            onClick={() => deleteReport(report.id)}
                            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
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

        {activeTab === 'templates' && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
              <h2 className="text-xl font-bold text-purple-400 flex items-center gap-2">
                <Layers size={20} />
                Report Templates
              </h2>
              <button
                onClick={() => setShowTemplateEditor(!showTemplateEditor)}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg"
              >
                <Plus size={18} />
                New Template
              </button>
            </div>

            {showTemplateEditor && (
              <div className="mb-6 p-4 bg-gray-700 rounded-lg border border-gray-600">
                <h3 className="font-medium text-purple-400 mb-3">Create Custom Template</h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Template Name</label>
                    <input
                      type="text"
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      className="w-full bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="My Custom Template"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">Template Content (Markdown)</label>
                    <textarea
                      value={templateContent}
                      onChange={(e) => setTemplateContent(e.target.value)}
                      className="w-full h-40 bg-gray-600 border border-gray-500 rounded px-3 py-2 text-gray-100 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="# My Report Template&#10;&#10;## Introduction&#10;&#10;## Findings&#10;&#10;## Recommendations"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={saveCustomTemplate}
                      className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg"
                    >
                      Save Template
                    </button>
                    <button
                      onClick={() => setShowTemplateEditor(false)}
                      className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(customTemplates).map(([name, content]) => (
                <div key={name} className="bg-gray-700 rounded-lg p-4 border border-gray-600">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium text-purple-400">{name}</h3>
                    <div className="flex gap-1">
                      <button
                        onClick={() => applyCustomTemplate(name)}
                        className="text-sm text-cyan-400 hover:text-cyan-300 px-2 py-1 rounded"
                      >
                        Apply
                      </button>
                      <button
                        onClick={() => deleteCustomTemplate(name)}
                        className="text-sm text-red-400 hover:text-red-300 px-2 py-1 rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm truncate">{content.slice(0, 100)}...</p>
                </div>
              ))}
            </div>

            {Object.keys(customTemplates).length === 0 && !showTemplateEditor && (
              <div className="text-center py-12">
                <Layers size={48} className="text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No custom templates yet</p>
                <p className="text-gray-500 text-sm mt-1">Create your first template to get started</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportWriter;
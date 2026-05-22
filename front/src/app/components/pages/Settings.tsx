import { useState } from "react";
import {
  User,
  Cpu,
  Bell,
  Shield,
  Trash2,
  ChevronDown,
  CheckCircle2,
  Save,
} from "lucide-react";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-[#2563EB]" : "bg-[#D1D5DB]"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E5E7EB] rounded-lg overflow-hidden">
      <div className="px-5 py-3 border-b border-[#E5E7EB] bg-[#F9FAFB]">
        <h2 className="text-[14px] font-semibold text-[#111827]">{title}</h2>
      </div>
      <div className="divide-y divide-[#E5E7EB]">{children}</div>
    </div>
  );
}

function Row({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div>
        <div className="text-[14px] text-[#111827]">{label}</div>
        {desc && <div className="text-[12px] text-[#9CA3AF] mt-0.5">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Settings() {
  const [saved, setSaved] = useState(false);
  const [profile, setProfile] = useState({ name: "李明", targetRole: "后端开发工程师", targetCompany: "互联网大厂" });
  const [notifInterviewEnd, setNotifInterviewEnd] = useState(true);
  const [notifWeeklyReport, setNotifWeeklyReport] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [showAnswerHint, setShowAnswerHint] = useState(true);
  const [modelMode, setModelMode] = useState<"local" | "cloud">("local");
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 max-w-[720px] mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold text-[#111827]">设置</h1>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 bg-[#2563EB] text-white px-4 py-2 rounded text-[13px] font-medium hover:bg-[#1D4ED8] transition-colors"
        >
          {saved ? <CheckCircle2 size={14} /> : <Save size={14} />}
          {saved ? "已保存" : "保存更改"}
        </button>
      </div>

      {/* Profile */}
      <Section title="个人信息">
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-[13px] font-medium text-[#374151] mb-1">姓名</label>
            <input
              type="text"
              value={profile.name}
              onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-[#E5E7EB] rounded px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#374151] mb-1">目标岗位</label>
            <input
              type="text"
              value={profile.targetRole}
              onChange={e => setProfile(p => ({ ...p, targetRole: e.target.value }))}
              className="w-full border border-[#E5E7EB] rounded px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
            />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[#374151] mb-1">目标公司类型</label>
            <div className="relative">
              <select
                value={profile.targetCompany}
                onChange={e => setProfile(p => ({ ...p, targetCompany: e.target.value }))}
                className="w-full appearance-none border border-[#E5E7EB] rounded px-3 py-2 text-[14px] bg-white pr-8 focus:outline-none focus:ring-1 focus:ring-[#2563EB] focus:border-[#2563EB]"
              >
                <option>互联网大厂</option>
                <option>中型互联网公司</option>
                <option>初创公司</option>
                <option>外资企业</option>
                <option>国企 / 央企</option>
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
            </div>
          </div>
        </div>
      </Section>

      {/* Model & mode */}
      <Section title="模型与运行模式">
        <Row label="运行模式" desc="本地模式不上传数据，云端模式效果更好">
          <div className="flex border border-[#E5E7EB] rounded overflow-hidden">
            {(["local", "cloud"] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setModelMode(mode)}
                className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  modelMode === mode ? "bg-[#2563EB] text-white" : "bg-white text-[#374151] hover:bg-[#F9FAFB]"
                }`}
              >
                {mode === "local" ? "本地" : "云端"}
              </button>
            ))}
          </div>
        </Row>
        <Row label="当前模型" desc={modelMode === "local" ? "Ollama · Llama-3-8B（本地）" : "GPT-4o（云端）"}>
          <div className="flex items-center gap-1.5 text-[13px] text-[#6B7280]">
            <Cpu size={13} />
            {modelMode === "local" ? "本地运行中" : "云端连接"}
          </div>
        </Row>
        <Row label="语言" desc="界面与面试语言">
          <div className="relative">
            <select
              value={language}
              onChange={e => setLanguage(e.target.value as "zh" | "en")}
              className="appearance-none border border-[#E5E7EB] rounded px-3 py-1.5 text-[13px] bg-white pr-7 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
          </div>
        </Row>
      </Section>

      {/* Interview preferences */}
      <Section title="面试偏好">
        <Row label="自动保存对话" desc="面试过程中自动保存，刷新后可恢复">
          <Toggle checked={autoSave} onChange={setAutoSave} />
        </Row>
        <Row label="显示提示按钮" desc="面试时展示「我需要一点提示」按钮">
          <Toggle checked={showAnswerHint} onChange={setShowAnswerHint} />
        </Row>
      </Section>

      {/* Notifications */}
      <Section title="通知">
        <Row label="面试结束提醒" desc="面试结束后推送报告生成通知">
          <Toggle checked={notifInterviewEnd} onChange={setNotifInterviewEnd} />
        </Row>
        <Row label="每周训练报告" desc="每周发送成长趋势摘要">
          <Toggle checked={notifWeeklyReport} onChange={setNotifWeeklyReport} />
        </Row>
      </Section>

      {/* Data & privacy */}
      <Section title="数据与隐私">
        <Row label="本地存储" desc="所有资料和对话记录存储在本地">
          <div className="flex items-center gap-1.5 text-[13px] text-[#16A34A]">
            <Shield size={13} />
            已启用
          </div>
        </Row>
        <div className="px-5 py-4">
          <div className="text-[13px] font-medium text-[#374151] mb-1">清除所有数据</div>
          <div className="text-[12px] text-[#9CA3AF] mb-3">清除本地所有面试记录、资料和配置，操作不可撤销。</div>
          {!deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-1.5 text-[13px] text-[#DC2626] border border-[#FECACA] px-3 py-1.5 rounded hover:bg-[#FEF2F2] transition-colors"
            >
              <Trash2 size={13} />
              清除所有数据
            </button>
          ) : (
            <div className="p-3 bg-[#FEF2F2] border border-[#FECACA] rounded space-y-2">
              <div className="text-[13px] text-[#DC2626] font-medium">确认清除？此操作不可撤销。</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-3 py-1.5 border border-[#E5E7EB] rounded text-[13px] text-[#374151] bg-white hover:bg-[#F9FAFB]"
                >
                  取消
                </button>
                <button
                  onClick={() => setDeleteConfirm(false)}
                  className="px-3 py-1.5 bg-[#DC2626] text-white rounded text-[13px] hover:bg-[#B91C1C]"
                >
                  确认清除
                </button>
              </div>
            </div>
          )}
        </div>
      </Section>

      {/* About */}
      <div className="text-center text-[12px] text-[#9CA3AF] pb-4 space-y-0.5">
        <div>面试训练台 · v0.1.0</div>
        <div>本地优先，数据不离开你的设备</div>
      </div>
    </div>
  );
}

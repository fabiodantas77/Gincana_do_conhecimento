import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Trophy,
  Trash2,
  Pencil,
  Users,
  ListChecks,
  Gauge,
  Settings,
  Download,
  Upload,
  RotateCcw,
  Save,
  Flag,
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./src/supabase";

const STORAGE_KEY = "gincana-campeonato-v1";

const TEAM_COLORS = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308",
  "#84CC16", "#22C55E", "#14B8A6", "#06B6D4",
  "#3B82F6", "#6366F1", "#8B5CF6", "#D946EF", "#EC4899"
];

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function normalizeData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!Array.isArray(value.teams) || !Array.isArray(value.events)) return null;

  const teams = value.teams
    .filter((team) => team && typeof team.id === "string" && typeof team.name === "string")
    .map((team, index) => ({
      id: team.id,
      name: team.name.trim() || `Equipe ${index + 1}`,
      color: typeof team.color === "string" ? team.color : TEAM_COLORS[index % TEAM_COLORS.length],
    }));
  const events = value.events
    .filter((event) => event && typeof event.id === "string" && typeof event.name === "string")
    .map((event, index) => ({ id: event.id, name: event.name.trim() || `Prova ${index + 1}` }));
  const validEventIds = new Set(events.map((event) => event.id));
  const validTeamIds = new Set(teams.map((team) => team.id));
  const scores = {};

  if (value.scores && typeof value.scores === "object" && !Array.isArray(value.scores)) {
    Object.entries(value.scores).forEach(([eventId, eventScores]) => {
      if (!validEventIds.has(eventId) || !eventScores || typeof eventScores !== "object" || Array.isArray(eventScores)) return;
      const cleanedScores = {};
      Object.entries(eventScores).forEach(([teamId, score]) => {
        const numberScore = Number(score);
        if (validTeamIds.has(teamId) && Number.isFinite(numberScore)) cleanedScores[teamId] = numberScore;
      });
      scores[eventId] = cleanedScores;
    });
  }

  return { teams, events, scores };
}

function loadInitialState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const normalized = normalizeData(parsed);
      if (normalized) return normalized;
    }
  } catch (e) {
    console.error("Falha ao carregar dados salvos:", e);
  }
  return { teams: [], events: [], scores: {} };
}

export default function App() {
  const [data, setData] = useState(loadInitialState);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [saveStatus, setSaveStatus] = useState("saved");
  const [authState, setAuthState] = useState(isSupabaseConfigured ? "checking" : "unconfigured");
  const [isAdmin, setIsAdmin] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const saveTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);
  const remoteDataRef = useRef("");
  const isAdminPage = window.location.pathname.replace(/\/$/, "").endsWith("/admin");

  const { teams, events, scores } = data;

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let active = true;

    async function loadRemoteData() {
      const { data: record, error } = await supabase
        .from("championship_data")
        .select("data")
        .eq("id", true)
        .maybeSingle();
      if (!active) return;
      if (error) {
        console.error("Erro ao carregar dados online:", error);
        setSaveStatus("error");
      } else if (record?.data) {
        const normalized = normalizeData(record.data);
        if (normalized) {
          remoteDataRef.current = JSON.stringify(normalized);
          setData(normalized);
        }
      }
      setRemoteReady(true);
    }

    async function checkAccess() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!active) return;
      if (!session) {
        setIsAdmin(false);
        setAuthState("signed-out");
        return;
      }
      const { data: allowed, error } = await supabase.rpc("is_admin");
      if (!active) return;
      setIsAdmin(!error && allowed === true);
      setAuthState(!error && allowed === true ? "signed-in" : "forbidden");
    }

    loadRemoteData();
    if (isAdminPage) checkAccess();
    else setAuthState("public");

    const channel = supabase
      .channel("championship-dashboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "championship_data" }, (payload) => {
        const normalized = normalizeData(payload.new?.data);
        if (normalized) {
          remoteDataRef.current = JSON.stringify(normalized);
          setData(normalized);
        }
      })
      .subscribe();
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      if (isAdminPage) checkAccess();
    });

    return () => {
      active = false;
      supabase.removeChannel(channel);
      authListener.subscription.unsubscribe();
    };
  }, [isAdminPage]);

  useEffect(() => {
    setSaveStatus("saving");
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => setSaveStatus("saved"), 350);
    } catch (e) {
      console.error("Erro ao salvar dados:", e);
      setSaveStatus("error");
    }
    return () => clearTimeout(saveTimeoutRef.current);
  }, [data]);

  useEffect(() => {
    if (!isSupabaseConfigured || !remoteReady || !isAdmin) return;
    const serialized = JSON.stringify(data);
    if (serialized === remoteDataRef.current) return;
    remoteDataRef.current = serialized;
    setSaveStatus("saving");
    supabase
      .from("championship_data")
      .upsert({ id: true, data, updated_at: new Date().toISOString() }, { onConflict: "id" })
      .then(({ error }) => setSaveStatus(error ? "error" : "saved"));
  }, [data, isAdmin, remoteReady]);

  function addTeam(name, color) {
    if (!name || !name.trim()) return;
    setData((prev) => ({
      ...prev,
      teams: [
        ...prev.teams,
        { id: uid(), name: name.trim(), color: color || TEAM_COLORS[prev.teams.length % TEAM_COLORS.length] },
      ],
    }));
  }

  function updateTeam(id, changes) {
    setData((prev) => ({
      ...prev,
      teams: prev.teams.map((t) => (t.id === id ? { ...t, ...changes } : t)),
    }));
  }

  function removeTeam(id) {
    setData((prev) => {
      const newScores = { ...prev.scores };
      Object.keys(newScores).forEach((eventId) => {
        if (newScores[eventId] && id in newScores[eventId]) {
          const copy = { ...newScores[eventId] };
          delete copy[id];
          newScores[eventId] = copy;
        }
      });
      return {
        ...prev,
        teams: prev.teams.filter((t) => t.id !== id),
        scores: newScores,
      };
    });
  }

  function addEvent(name) {
    if (!name || !name.trim()) return;
    setData((prev) => ({
      ...prev,
      events: [...prev.events, { id: uid(), name: name.trim() }],
    }));
  }

  function updateEvent(id, changes) {
    setData((prev) => ({
      ...prev,
      events: prev.events.map((e) => (e.id === id ? { ...e, ...changes } : e)),
    }));
  }

  function removeEvent(id) {
    setData((prev) => {
      const newScores = { ...prev.scores };
      delete newScores[id];
      return {
        ...prev,
        events: prev.events.filter((e) => e.id !== id),
        scores: newScores,
      };
    });
  }

  function setScore(eventId, teamId, value) {
    setData((prev) => {
      const eventScores = { ...(prev.scores[eventId] || {}) };
      if (value === "" || value === null || value === undefined) {
        delete eventScores[teamId];
      } else {
        const num = Number(value);
        eventScores[teamId] = Number.isFinite(num) ? num : 0;
      }
      return {
        ...prev,
        scores: { ...prev.scores, [eventId]: eventScores },
      };
    });
  }

  const ranking = useMemo(() => {
    const rows = teams.map((team) => {
      let total = 0;
      let disputed = 0;
      events.forEach((ev) => {
        const val = scores[ev.id] ? scores[ev.id][team.id] : undefined;
        if (val !== undefined && val !== null) {
          total += Number(val) || 0;
          disputed += 1;
        }
      });
      return { ...team, total, disputed };
    });
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return rows;
  }, [teams, events, scores]);

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `campeonato-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = JSON.parse(evt.target.result);
        const normalized = normalizeData(parsed);
        if (!normalized) {
          throw new Error("Formato inválido");
        }
        setData(normalized);
      } catch (e) {
        alert("Não foi possível importar o arquivo JSON.");
      }
    };
    reader.readAsText(file);
  }

  function resetChampionship() {
    if (window.confirm("Apagar todas as equipes, provas e pontuações?")) {
      setData({ teams: [], events: [], scores: {} });
    }
  }

  const tabs = [
    { id: "dashboard", label: "Dashboard & Pódio", icon: Gauge },
    { id: "scores", label: "Lançar Pontuações", icon: ListChecks },
    { id: "register", label: "Cadastrar Equipes e Provas", icon: Users },
    { id: "settings", label: "Configurações & Backup", icon: Settings },
  ];

  if (!isSupabaseConfigured) return <SetupRequired />;
  if (!isAdminPage) return <PublicDashboard ranking={ranking} eventsCount={events.length} />;
  if (authState === "checking") return <LoadingScreen message="Verificando acesso administrativo..." />;
  if (authState !== "signed-in") return <AdminLogin state={authState} />;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-900/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500">
              <Trophy className="w-5 h-5 text-slate-900" />
            </div>
            <h1 className="text-lg font-bold">Gincana do conhecimento</h1>
          </div>
          <SaveIndicator status={saveStatus} />
        </div>
        <nav className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto pb-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  active ? "bg-amber-400 text-slate-900 font-bold" : "text-slate-300 hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {activeTab === "dashboard" && <Dashboard ranking={ranking} eventsCount={events.length} />}
        {activeTab === "scores" && (
          <ScoresTab teams={teams} events={events} scores={scores} setScore={setScore} addEvent={addEvent} />
        )}
        {activeTab === "register" && (
          <RegisterTab
            teams={teams}
            events={events}
            addTeam={addTeam}
            updateTeam={updateTeam}
            removeTeam={removeTeam}
            addEvent={addEvent}
            updateEvent={updateEvent}
            removeEvent={removeEvent}
          />
        )}
        {activeTab === "settings" && (
          <SettingsTab
            exportData={exportData}
            importData={importData}
            resetChampionship={resetChampionship}
            fileInputRef={fileInputRef}
            teamsCount={teams.length}
            eventsCount={events.length}
          />
        )}
      </main>
    </div>
  );
}

function PublicDashboard({ ranking, eventsCount }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-900/90 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500">
            <Trophy className="w-5 h-5 text-slate-900" />
          </div>
          <h1 className="text-lg font-bold">Gincana do conhecimento</h1>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Dashboard ranking={ranking} eventsCount={eventsCount} />
      </main>
    </div>
  );
}

function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center px-4">
      <p className="text-slate-300">{message}</p>
    </div>
  );
}

function SetupRequired() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-4">
      <div className="max-w-lg rounded-xl border border-amber-500/30 bg-slate-900 p-6 space-y-3">
        <h1 className="text-xl font-bold text-amber-400">Configuração necessária</h1>
        <p className="text-sm text-slate-300">Defina as variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para conectar o placar compartilhado.</p>
        <p className="text-xs text-slate-500">Use o arquivo .env.example como referência. Nunca inclua uma chave service_role no navegador.</p>
      </div>
    </div>
  );
}

function AdminLogin({ state }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(state === "forbidden" ? "Este usuário não possui permissão de administrador." : "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) setError("E-mail ou senha inválidos.");
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 grid place-items-center p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-white/10 bg-slate-900 p-6">
        <div className="flex items-center gap-2 text-amber-400"><Trophy className="w-5 h-5" /><h1 className="text-lg font-bold">Área administrativa</h1></div>
        <input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="E-mail" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10" />
        <input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Senha" className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10" />
        {error && <p className="text-sm text-red-300">{error}</p>}
        <button disabled={loading} className="w-full px-4 py-2 rounded-lg bg-amber-400 text-slate-900 font-bold disabled:opacity-60">{loading ? "Entrando..." : "Entrar"}</button>
        <a href="../" className="block text-center text-xs text-slate-400 hover:text-white">Voltar ao placar público</a>
      </form>
    </div>
  );
}

function SaveIndicator({ status }) {
  const saving = status === "saving";
  const failed = status === "error";
  return (
    <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${saving ? "border-amber-500/30 text-amber-300" : failed ? "border-red-500/30 text-red-300" : "border-emerald-500/30 text-emerald-300"}`}>
      <span className={`w-2 h-2 rounded-full ${saving ? "bg-amber-400 animate-pulse" : failed ? "bg-red-400" : "bg-emerald-400"}`} />
      {saving ? "Salvando..." : failed ? "Erro ao salvar" : "Salvo"}
    </div>
  );
}

function Dashboard({ ranking, eventsCount }) {
  if (ranking.length === 0) return <EmptyState title="Nenhuma equipe cadastrada" description="Acesse a aba 'Cadastrar Equipes e Provas' para começar." />;
  const [first, second, third] = ranking.slice(0, 3);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-amber-400"><Trophy className="w-5 h-5" /> Pódio</h2>
        <div className="grid grid-cols-3 gap-3 items-end">
          <PodiumCard place={2} team={second} heightClass="h-28" />
          <PodiumCard place={1} team={first} heightClass="h-36" />
          <PodiumCard place={3} team={third} heightClass="h-20" />
        </div>
      </div>

      <div>
        <h2 className="text-xl font-bold mb-4">Classificação Geral</h2>
        <div className="rounded-xl border border-white/10 overflow-hidden bg-white/[0.02]">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/5 text-slate-300 text-left">
                <th className="px-4 py-3">Pos.</th>
                <th className="px-4 py-3">Equipe</th>
                <th className="px-4 py-3 text-right">Pontos</th>
                <th className="px-4 py-3 text-right">Provas</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((team, idx) => (
                <tr key={team.id} className="border-t border-white/5">
                  <td className="px-4 py-3 font-bold">{idx + 1}º</td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: team.color }} />
                    {team.name}
                  </td>
                  <td className="px-4 py-3 text-right font-bold">{team.total}</td>
                  <td className="px-4 py-3 text-right text-slate-400">{team.disputed} / {eventsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function PodiumCard({ place, team, heightClass }) {
  if (!team) return <div className="h-20 bg-white/5 rounded-t-xl border border-dashed border-white/10 flex items-center justify-center text-xs text-slate-500">Vazio</div>;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="p-3 rounded-xl bg-slate-800 border border-white/10 text-center w-full">
        <p className="font-bold text-sm truncate">{team.name}</p>
        <p className="text-lg font-black text-amber-400">{team.total} pts</p>
      </div>
      <div className={`w-full ${heightClass} rounded-t-lg bg-amber-500/20 border-t border-amber-500/40 flex items-center justify-center font-bold text-xl`}>
        {place}º
      </div>
    </div>
  );
}

function ScoresTab({ teams, events, scores, setScore, addEvent }) {
  const [newEventName, setNewEventName] = useState("");

  function handleAdd(e) {
    e.preventDefault();
    if (!newEventName.trim()) return;
    addEvent(newEventName);
    setNewEventName("");
  }

  if (teams.length === 0) return <EmptyState title="Cadastre equipes primeiro" description="Acesse a aba 'Cadastrar Equipes e Provas'." />;

  return (
    <div className="space-y-6">
      <form onSubmit={handleAdd} className="flex gap-2 max-w-md">
        <input
          value={newEventName}
          onChange={(e) => setNewEventName(e.target.value)}
          placeholder="Nome da nova prova"
          className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
        />
        <button type="submit" className="px-4 py-2 rounded-lg bg-amber-400 text-slate-900 font-bold text-sm">
          + Prova
        </button>
      </form>

      {events.length === 0 ? (
        <EmptyState title="Nenhuma prova cadastrada" description="Adicione uma prova no campo acima." />
      ) : (
        <div className="rounded-xl border border-white/10 overflow-x-auto bg-white/[0.02]">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="bg-white/5 text-slate-300 text-left">
                <th className="px-4 py-3">Prova</th>
                {teams.map((t) => (
                  <th key={t.id} className="px-3 py-3 text-center">{t.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((ev) => (
                <tr key={ev.id} className="border-t border-white/5">
                  <td className="px-4 py-2.5 font-medium">{ev.name}</td>
                  {teams.map((team) => (
                    <td key={team.id} className="px-2 py-2 text-center">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={scores[ev.id]?.[team.id] ?? ""}
                        onChange={(e) => setScore(ev.id, team.id, e.target.value)}
                        placeholder="0"
                        className="w-16 text-center px-2 py-1 rounded bg-white/5 border border-white/10 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RegisterTab({ teams, events, addTeam, updateTeam, removeTeam, addEvent, updateEvent, removeEvent }) {
  const [teamName, setTeamName] = useState("");
  const [teamColor, setTeamColor] = useState(TEAM_COLORS[0]);
  const [eventName, setEventName] = useState("");

  function handleAddTeam(e) {
    e.preventDefault();
    if (!teamName.trim()) return;
    addTeam(teamName, teamColor);
    setTeamName("");
  }

  function handleAddEvent(e) {
    e.preventDefault();
    if (!eventName.trim()) return;
    addEvent(eventName);
    setEventName("");
  }

  return (
    <div className="grid md:grid-cols-2 gap-8">
      <section className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2"><Users className="w-5 h-5 text-emerald-400" /> Equipes</h2>
        <form onSubmit={handleAddTeam} className="flex gap-2">
          <input
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="Nome da equipe"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
          />
          <input
            type="color"
            value={teamColor}
            onChange={(e) => setTeamColor(e.target.value)}
            className="w-10 h-10 rounded bg-transparent border border-white/10 cursor-pointer"
          />
          <button type="submit" className="px-4 py-2 bg-emerald-500 text-slate-900 font-bold rounded-lg text-sm">Adicionar</button>
        </form>
        <ul className="space-y-2">
          {teams.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm">
              <div className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: t.color }} />
                <span>{t.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Editar ${t.name}`}
                  onClick={() => {
                    const name = window.prompt("Novo nome da equipe:", t.name);
                    if (name?.trim()) updateTeam(t.id, { name: name.trim() });
                  }}
                  className="text-slate-300 hover:text-white"
                ><Pencil className="w-4 h-4" /></button>
                <button type="button" aria-label={`Excluir ${t.name}`} onClick={() => removeTeam(t.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-bold flex items-center gap-2"><Flag className="w-5 h-5 text-orange-400" /> Provas</h2>
        <form onSubmit={handleAddEvent} className="flex gap-2">
          <input
            value={eventName}
            onChange={(e) => setEventName(e.target.value)}
            placeholder="Nome da prova"
            className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm"
          />
          <button type="submit" className="px-4 py-2 bg-orange-500 text-slate-900 font-bold rounded-lg text-sm">Adicionar</button>
        </form>
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg border border-white/10 text-sm">
              <span>{e.name}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Editar ${e.name}`}
                  onClick={() => {
                    const name = window.prompt("Novo nome da prova:", e.name);
                    if (name?.trim()) updateEvent(e.id, { name: name.trim() });
                  }}
                  className="text-slate-300 hover:text-white"
                ><Pencil className="w-4 h-4" /></button>
                <button type="button" aria-label={`Excluir ${e.name}`} onClick={() => removeEvent(e.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-4 h-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function SettingsTab({ exportData, importData, resetChampionship, fileInputRef, teamsCount, eventsCount }) {
  return (
    <div className="max-w-md space-y-4">
      <h2 className="text-lg font-bold">Configurações</h2>
      <p className="text-xs text-slate-400">{teamsCount} equipe(s) | {eventsCount} prova(s)</p>
      <div className="flex gap-2">
        <button onClick={exportData} className="px-3 py-2 bg-sky-500 text-slate-900 font-bold rounded-lg text-sm flex items-center gap-1"><Download className="w-4 h-4" /> Exportar</button>
        <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-emerald-500 text-slate-900 font-bold rounded-lg text-sm flex items-center gap-1"><Upload className="w-4 h-4" /> Importar</button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importData(file);
            e.target.value = "";
          }}
        />
      </div>
      <button onClick={resetChampionship} className="px-3 py-2 bg-red-500 text-white font-bold rounded-lg text-sm flex items-center gap-1"><RotateCcw className="w-4 h-4" /> Resetar Dados</button>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="text-center py-12 border border-dashed border-white/10 rounded-xl bg-white/[0.01]">
      <p className="font-bold text-slate-300">{title}</p>
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    </div>
  );
}

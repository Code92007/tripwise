import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp,
  ArrowRight,
  BadgeHelp,
  BusFront,
  CarFront,
  Check,
  ChevronDown,
  ClipboardList,
  Clock3,
  Footprints,
  MapPin,
  Pencil,
  Plane,
  Plus,
  RotateCcw,
  Route as RouteIcon,
  Search,
  SlidersHorizontal,
  TrainFront,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import {
  compareWithFastest,
  formatNumber,
  isRoute,
  presets,
  rankRoutes,
  sampleRoutes,
  scoreRoute,
  type Preset,
  type Route,
  type TravelMode,
  type Weights,
} from './scoring'
import { searchRoutes, type RouteSearch } from './routeApi'
import { PreferenceQuiz } from './PreferenceQuiz'

const storageKey = 'tripwise-v1'

type SavedState = {
  origin: string
  destination: string
  routes: Route[]
  preset: Preset
  weights: Weights
  lastQuery?: Omit<RouteSearch, 'routes'>
}

const initialState: SavedState = {
  origin: '',
  destination: '',
  routes: sampleRoutes,
  preset: 'comfort',
  weights: presets.comfort,
}

function readSavedState(): SavedState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null') as Partial<SavedState> | null
    if (!saved || !Array.isArray(saved.routes) || !saved.routes.every(isRoute)) return initialState
    const preset = ['comfort', 'value', 'speed', 'custom'].includes(String(saved.preset)) ? saved.preset! : 'comfort'
    const weights = saved.weights
    const validWeights = weights && ['price', 'walking', 'transfer', 'delay', 'stopGo'].every(
      (key) => typeof weights[key as keyof Weights] === 'number' && Number.isFinite(weights[key as keyof Weights]),
    )
    return {
      origin: typeof saved.origin === 'string' ? saved.origin : '',
      destination: typeof saved.destination === 'string' ? saved.destination : '',
      routes: saved.routes,
      preset,
      weights: validWeights ? weights : presets.comfort,
      lastQuery: saved.lastQuery && typeof saved.lastQuery.fetchedAt === 'string' && Array.isArray(saved.lastQuery.warnings) ? saved.lastQuery : undefined,
    }
  } catch {
    return initialState
  }
}

const modeNames: Record<TravelMode, string> = {
  transit: '公交 / 地铁',
  rail: '火车',
  flight: '飞机',
  drive: '驾车',
  walk: '步行',
  mixed: '组合出行',
}

function ModeIcon({ mode, size = 17 }: { mode: TravelMode; size?: number }) {
  const props = { size, strokeWidth: 1.9, 'aria-hidden': true as const }
  if (mode === 'drive') return <CarFront {...props} />
  if (mode === 'rail') return <TrainFront {...props} />
  if (mode === 'flight') return <Plane {...props} />
  if (mode === 'walk') return <Footprints {...props} />
  if (mode === 'mixed') return <RouteIcon {...props} />
  return <BusFront {...props} />
}

type RouteDraft = Omit<Route, 'id'>

const blankDraft: RouteDraft = {
  name: '',
  mode: 'transit',
  minutes: 30,
  price: 0,
  walkMinutes: 0,
  transfers: 0,
  delayMinutes: 0,
  stopGo: 0,
  note: '',
}

const weightFields: { key: keyof Weights; label: string; hint: string; min: number; max: number; step: number; unit: string }[] = [
  { key: 'price', label: '费用', hint: '每花 1 元折合的分钟', min: 0, max: 2, step: 0.05, unit: '分/元' },
  { key: 'walking', label: '步行', hint: '每走 1 分钟增加的负担', min: -0.5, max: 1.5, step: 0.05, unit: '分/分' },
  { key: 'transfer', label: '换乘', hint: '每换乘 1 次的额外负担', min: 0, max: 20, step: 1, unit: '分/次' },
  { key: 'delay', label: '不确定性', hint: '预计波动时间的折算系数', min: 0, max: 2, step: 0.1, unit: '倍' },
  { key: 'stopGo', label: '停走负担', hint: '驾车起停强度每级的负担', min: 0, max: 6, step: 0.5, unit: '分/级' },
]

function RouteEditor({ route, onSave, onClose }: { route?: Route; onSave: (route: Route) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<RouteDraft>(route ? { ...route, source: 'manual' } : blankDraft)
  const [error, setError] = useState('')

  function setNumber(key: keyof RouteDraft, raw: string) {
    setDraft((current) => ({ ...current, [key]: raw === '' ? 0 : Number(raw) }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.name.trim()) return setError('请填写方案名称。')
    if (draft.minutes <= 0 || (draft.walkMinutes !== null && draft.walkMinutes > draft.minutes)) return setError('总用时需大于 0，步行时间不能超过总用时。')
    if (Object.values(draft).some((value) => typeof value === 'number' && (!Number.isFinite(value) || value < 0))) return setError('数值不能为负数。')
    onSave({ ...draft, name: draft.name.trim(), note: draft.note.trim(), source: 'manual', id: route?.id || crypto.randomUUID() })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="editor-head">
          <div>
            <span className="eyebrow">候选方案</span>
            <h2 id="editor-title">{route ? '编辑方案' : '添加方案'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={19} /></button>
        </div>
        <form onSubmit={submit}>
          <div className="form-grid">
            <label className="field field-wide">方案名称
              <input autoFocus value={draft.name} maxLength={40} placeholder="如：高铁到杭州后换乘航班" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <label className="field field-wide">出行方式
              <select value={draft.mode} onChange={(event) => setDraft({ ...draft, mode: event.target.value as TravelMode })}>
                {Object.entries(modeNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label className="field">总用时 · 分钟<input type="number" min="1" step="1" value={draft.minutes} onChange={(event) => setNumber('minutes', event.target.value)} /></label>
            <label className="field">费用 · 元<input type="number" min="0" step="0.1" value={draft.price ?? ''} placeholder="待核实" onChange={(event) => setDraft({ ...draft, price: event.target.value === '' ? null : Number(event.target.value) })} /></label>
            <label className="field">步行 · 分钟<input type="number" min="0" step="1" value={draft.walkMinutes ?? ''} placeholder="未知" onChange={(event) => setDraft({ ...draft, walkMinutes: event.target.value === '' ? null : Number(event.target.value) })} /></label>
            <label className="field">换乘 · 次<input type="number" min="0" step="1" value={draft.transfers} onChange={(event) => setNumber('transfers', event.target.value)} /></label>
            <label className="field">可能延误 · 分钟<input type="number" min="0" step="1" value={draft.delayMinutes ?? ''} placeholder="未知" onChange={(event) => setDraft({ ...draft, delayMinutes: event.target.value === '' ? null : Number(event.target.value) })} /></label>
            <label className="field">停走强度 · 0–5<input type="number" min="0" max="5" step="1" value={draft.stopGo ?? ''} placeholder="未知" onChange={(event) => setDraft({ ...draft, stopGo: event.target.value === '' ? null : Number(event.target.value) })} /></label>
            <label className="field field-wide">备注<input value={draft.note} maxLength={100} placeholder="这条路线有什么特点" onChange={(event) => setDraft({ ...draft, note: event.target.value })} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="editor-actions">
            <button className="button button-quiet" type="button" onClick={onClose}>取消</button>
            <button className="button button-primary" type="submit"><Check size={17} />保存方案</button>
          </div>
        </form>
      </section>
    </div>
  )
}

function App() {
  const [state, setState] = useState<SavedState>(readSavedState)
  const [editing, setEditing] = useState<Route | 'new' | null>(null)
  const [showWeights, setShowWeights] = useState(false)
  const [showQuiz, setShowQuiz] = useState(false)
  const quizTrigger = useRef<HTMLButtonElement>(null)
  const [sort, setSort] = useState<'score' | 'time' | 'price'>('score')
  const [confirmedReset, setConfirmedReset] = useState(false)
  const [querying, setQuerying] = useState(false)
  const [queryError, setQueryError] = useState('')

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(state))
  }, [state])

  const ranked = useMemo(() => rankRoutes(state.routes, state.weights), [state.routes, state.weights])
  const displayed = useMemo(() => {
    if (sort === 'time') return [...state.routes].sort((a, b) => a.minutes - b.minutes)
    if (sort === 'price') return [...state.routes].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity) || a.minutes - b.minutes)
    return ranked
  }, [ranked, sort, state.routes])
  const best = ranked.find((route) => scoreRoute(route, state.weights) !== null)
  const scores = ranked.map((route) => scoreRoute(route, state.weights)).filter((score): score is number => score !== null)
  const minScore = scores.length ? Math.min(...scores) : 0
  const maxScore = scores.length ? Math.max(...scores) : 0
  const hasSamples = state.routes.some((route) => route.id.startsWith('sample-'))

  function saveRoute(route: Route) {
    setState((current) => ({
      ...current,
      routes: current.routes.some((item) => item.id === route.id)
        ? current.routes.map((item) => item.id === route.id ? route : item)
        : [...current.routes, route],
    }))
    setEditing(null)
  }

  function reset() {
    if (!confirmedReset) {
      setConfirmedReset(true)
      window.setTimeout(() => setConfirmedReset(false), 5000)
      return
    }
    setState(initialState)
    setConfirmedReset(false)
    setSort('score')
  }

  function closeQuiz() {
    setShowQuiz(false)
    window.requestAnimationFrame(() => quizTrigger.current?.focus())
  }

  function applyQuiz(weights: Weights) {
    setState((current) => ({ ...current, preset: 'custom', weights }))
    setShowWeights(true)
    closeQuiz()
  }

  async function queryRoutes() {
    if (!state.origin.trim() || !state.destination.trim()) return setQueryError('请先填写出发地和目的地。')
    setQueryError('')
    setQuerying(true)
    try {
      const result = await searchRoutes(state.origin.trim(), state.destination.trim())
      const { routes, ...lastQuery } = result
      setState((current) => ({ ...current, routes: [...current.routes.filter((route) => route.source === 'manual' || (!route.source && !route.id.startsWith('sample-'))), ...routes], lastQuery }))
      setSort('score')
    } catch (error) {
      setQueryError(error instanceof Error ? error.message : '路线查询失败')
    } finally {
      setQuerying(false)
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand"><span className="brand-mark"><RouteIcon size={21} strokeWidth={2.2} /></span><span>途衡</span><small>TRIPWISE</small></div>
          <span className="topbar-status"><span className="status-dot" />路线方案比较</span>
        </div>
      </header>

      <main className="workspace">
        <div className="page-heading">
          <div>
            <p className="eyebrow">你的出行，由你定义</p>
            <h1>找到更合适的路线</h1>
          </div>
          <button className={`button button-outline reset-button ${confirmedReset ? 'confirmed' : ''}`} onClick={reset} title="恢复示例数据和默认偏好"><RotateCcw size={16} />{confirmedReset ? '再点一次确认重置' : '重置示例'}</button>
        </div>

        <div className="layout">
          <aside className="controls">
            <section className="control-section journey-section">
              <div className="section-title"><h2>本次行程</h2><span className="section-index">01</span></div>
              <div className="place-fields">
                <label className="place-field"><span className="place-icon origin"><MapPin size={16} /></span><span className="sr-only">出发地</span><input value={state.origin} placeholder="输入出发地" onChange={(event) => setState({ ...state, origin: event.target.value })} /></label>
                <div className="place-connector" />
                <label className="place-field"><span className="place-icon destination"><MapPin size={16} /></span><span className="sr-only">目的地</span><input value={state.destination} placeholder="输入目的地" onChange={(event) => setState({ ...state, destination: event.target.value })} /></label>
              </div>
              <button className="button button-primary query-button" onClick={queryRoutes} disabled={querying}><Search size={16} />{querying ? '查询中…' : '查询路线'}</button>
              {queryError && <p className="form-error" role="alert">{queryError}</p>}
              <p className="field-note">{import.meta.env.VITE_API_BASE_URL ? '查询高德公交、驾车与步行候选方案。' : '尚未配置路线服务；你仍可手动比较方案。'}</p>
              <div className="flight-check"><span>跨城机票核价</span><a href="https://flights.ctrip.com/" target="_blank" rel="noopener noreferrer">携程</a><a href="https://flight.qunar.com/" target="_blank" rel="noopener noreferrer">去哪儿</a></div>
            </section>

            <section className="control-section">
              <div className="section-title"><h2>偏好模式</h2><span className="section-index">02</span></div>
              <div className="preset-list" role="group" aria-label="偏好模式">
                {([
                  ['comfort', '体验优先', '少折腾、稳一些'],
                  ['value', '性价比', '时间和费用都值得'],
                  ['speed', '赶时间', '先看门到门用时'],
                ] as const).map(([key, label, description]) => (
                  <button key={key} className={`preset ${state.preset === key ? 'selected' : ''}`} onClick={() => setState({ ...state, preset: key, weights: presets[key] })} aria-pressed={state.preset === key}>
                    <span className="preset-radio">{state.preset === key && <Check size={12} strokeWidth={3} />}</span>
                    <span><strong>{label}</strong><small>{description}</small></span>
                  </button>
                ))}
              </div>
              <button ref={quizTrigger} className="quiz-entry" type="button" onClick={() => setShowQuiz(true)}><ClipboardList size={17} /><span>做偏好问卷</span><ArrowRight size={16} /></button>
              <button className={`tune-toggle ${showWeights ? 'open' : ''}`} aria-expanded={showWeights} onClick={() => setShowWeights(!showWeights)}><SlidersHorizontal size={16} />微调偏好<ChevronDown size={16} /></button>
              {showWeights && <div className="weight-list">
                {weightFields.map((field) => <label className="weight-field" key={field.key} title={field.hint}>
                  <span className="weight-label"><span>{field.label}</span><strong>{String(state.weights[field.key])} <small>{field.unit}</small></strong></span>
                  <input type="range" min={field.min} max={field.max} step={field.step} value={state.weights[field.key]} onChange={(event) => setState({ ...state, preset: 'custom', weights: { ...state.weights, [field.key]: Number(event.target.value) } })} />
                </label>)}
              </div>}
            </section>
            <p className="privacy-note"><BadgeHelp size={15} />方案与偏好保存在当前设备；查询时起终点会发送至高德地图。</p>
          </aside>

          <section className="results" aria-labelledby="results-title">
            <div className="results-head">
              <div><p className="eyebrow">方案比较</p><h2 id="results-title">为你排序的候选路线 <span>{state.routes.length}</span></h2></div>
              <button className="button button-primary add-button" onClick={() => setEditing('new')}><Plus size={18} />添加方案</button>
            </div>

            {hasSamples && <div className="sample-banner"><span className="sample-badge">示例数据</span><span>以下方案用于演示比较方法，时间与价格不是实时路线查询结果。</span></div>}
            {state.lastQuery && <div className="data-banner">{state.lastQuery.provider} · 查询于 {new Date(state.lastQuery.fetchedAt).toLocaleString('zh-CN')}{state.lastQuery.warnings.length > 0 && ` · ${state.lastQuery.warnings.join('、')}`}</div>}

            {best && <div className="recommendation">
              <div className="recommendation-main"><span className="recommendation-kicker"><Check size={14} />当前偏好首选</span><h3>{best.name}</h3><p>{compareWithFastest(best, state.routes)}</p></div>
              <div className="recommendation-score"><strong>{formatNumber(scoreRoute(best, state.weights)!)}</strong><span>等效分钟</span></div>
            </div>}

            <div className="list-toolbar"><span>{state.origin || state.destination ? `${state.origin || '出发地'}  →  ${state.destination || '目的地'}` : '候选方案'}</span><label><ArrowDownUp size={15} /><span className="sr-only">排序方式</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="score">按综合适合度</option><option value="time">按用时</option><option value="price">按费用</option></select></label></div>

            <div className="route-list">
              {displayed.length === 0 && <div className="empty-state"><RouteIcon size={34} /><h3>还没有候选方案</h3><p>添加几条你想比较的路线。</p><button className="button button-primary" onClick={() => setEditing('new')}><Plus size={17} />添加方案</button></div>}
              {displayed.map((route, index) => {
                const score = scoreRoute(route, state.weights)
                const isBest = best?.id === route.id
                const barWidth = score === null ? 0 : maxScore === minScore ? 100 : 35 + 65 * (maxScore - score) / (maxScore - minScore)
                return <article className={`route-card ${isBest ? 'best' : ''}`} key={route.id}>
                  <div className="route-top">
                    <span className="route-rank">{String(index + 1).padStart(2, '0')}</span>
                    <div className="route-identity"><span className="mode-pill"><ModeIcon mode={route.mode} />{modeNames[route.mode]} · {route.source === 'amap' ? '高德' : route.id.startsWith('sample-') ? '示例' : '手动'}</span><h3>{route.name}</h3>{route.note && <p>{route.note}</p>}</div>
                    <div className="card-actions"><button className="icon-button" title="编辑方案" aria-label={`编辑${route.name}`} onClick={() => setEditing(route)}><Pencil size={17} /></button><button className="icon-button danger" title="删除方案" aria-label={`删除${route.name}`} onClick={() => setState({ ...state, routes: state.routes.filter((item) => item.id !== route.id) })}><Trash2 size={17} /></button></div>
                  </div>
                  <div className="route-metrics">
                    <div><Clock3 size={17} /><strong>{formatNumber(route.minutes)} 分钟</strong><small>{route.source === 'amap' && route.mode === 'drive' ? '驾车段用时' : '规划用时'}</small></div>
                    <div><Wallet size={17} /><strong>{route.price === null ? '待核实' : `¥${formatNumber(route.price)}`}</strong><small>预计费用</small></div>
                    <div><Footprints size={17} /><strong>{route.walkMinutes === null ? '未知' : `${formatNumber(route.walkMinutes)} 分钟`}</strong><small>步行</small></div>
                    <div><ArrowRight size={17} /><strong>{formatNumber(route.transfers)} 次</strong><small>换乘</small></div>
                  </div>
                  <div className="score-line"><div className="score-bar"><span style={{ width: `${barWidth}%` }} /></div><strong>{score === null ? '待补费用' : formatNumber(score)} <small>{score === null ? '暂不排序' : '等效分钟'}</small></strong></div>
                  {((route.delayMinutes ?? 0) > 0 || (route.stopGo ?? 0) > 0 || route.trafficLights != null) && <div className="route-foot">{(route.delayMinutes ?? 0) > 0 && `预计波动 ${formatNumber(route.delayMinutes!)} 分钟`}{(route.stopGo ?? 0) > 0 && ` · 停走强度 ${formatNumber(route.stopGo!)}/5`}{route.trafficLights != null && ` · 红绿灯 ${formatNumber(route.trafficLights)} 个`}</div>}
                </article>
              })}
            </div>
            <p className="method-note">等效分钟 = 规划用时 + 费用、步行、换乘、延误与停走负担的个性化折算。未知费用的路线暂不参与推荐；未知延误与停走负担未计入，请结合实际判断。</p>
          </section>
        </div>
      </main>
      {editing && <RouteEditor key={editing === 'new' ? 'new' : editing.id} route={editing === 'new' ? undefined : editing} onSave={saveRoute} onClose={() => setEditing(null)} />}
      {showQuiz && <PreferenceQuiz onApply={applyQuiz} onClose={closeQuiz} />}
    </div>
  )
}

export default App

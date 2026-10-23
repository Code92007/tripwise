import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, RotateCcw, X } from 'lucide-react'
import type { Weights } from './scoring'
import { preferenceQuestions, weightsFromAnswers } from './quizConfig'

export function PreferenceQuiz({ onApply, onClose }: { onApply: (weights: Weights) => void; onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Partial<Weights>>({})
  const heading = useRef<HTMLHeadingElement>(null)
  const question = preferenceQuestions[step]
  const proposal = weightsFromAnswers(answers)

  useEffect(() => {
    heading.current?.focus()
  }, [step])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="quiz-dialog" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
        <div className="editor-head">
          <div>
            <span className="eyebrow">偏好问卷</span>
            <h2 id="quiz-title" ref={heading} tabIndex={-1}>{question ? question.title : '确认你的偏好参数'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭问卷" title="关闭问卷"><X size={19} /></button>
        </div>

        {question ? <>
          <div className="quiz-progress"><span>第 {step + 1} / {preferenceQuestions.length} 题</span><div aria-hidden="true"><span style={{ width: `${(step + 1) / preferenceQuestions.length * 100}%` }} /></div></div>
          <p className="quiz-context">{question.context}</p>
          <div className="quiz-choices" role="group" aria-label={question.title}>
            {question.choices.map((choice) => <button
              type="button"
              key={choice.value}
              className={`quiz-choice ${answers[question.key] === choice.value ? 'selected' : ''}`}
              aria-pressed={answers[question.key] === choice.value}
              onClick={() => setAnswers((current) => ({ ...current, [question.key]: choice.value }))}
            ><span className="preset-radio">{answers[question.key] === choice.value && <Check size={12} strokeWidth={3} />}</span>{choice.label}</button>)}
          </div>
          <div className="quiz-actions">
            <button className="button button-quiet" type="button" onClick={() => setStep(step - 1)} disabled={step === 0}><ArrowLeft size={15} />上一步</button>
            <button className="button button-primary" type="button" disabled={answers[question.key] === undefined} onClick={() => setStep(step + 1)}>{step === preferenceQuestions.length - 1 ? '查看参数' : '下一题'}<ArrowRight size={15} /></button>
          </div>
        </> : proposal && <>
          <div className="quiz-summary">
            {preferenceQuestions.map((item) => <div key={item.key}><span>{item.metric}</span><strong>{String(proposal[item.key])} <small>{item.unit}</small></strong></div>)}
          </div>
          <p className="quiz-note">这些数值是你的选择对应的起点。路线没有延误或停走数据时，相应参数不会影响排序。</p>
          <div className="quiz-actions">
            <button className="button button-quiet" type="button" onClick={() => { setStep(0); setAnswers({}) }}><RotateCcw size={15} />重新作答</button>
            <button className="button button-primary" type="button" onClick={() => onApply(proposal)}><Check size={16} />应用偏好</button>
          </div>
        </>}
      </section>
    </div>
  )
}

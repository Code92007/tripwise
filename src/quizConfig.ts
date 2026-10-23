import type { Weights } from './scoring'

type Choice = { label: string; value: number }
type Question = {
  key: keyof Weights
  metric: string
  unit: string
  title: string
  context: string
  choices: Choice[]
}

export const preferenceQuestions: Question[] = [
  {
    key: 'price', metric: '费用', unit: '分/元',
    title: '为了省 20 元，你能接受多花多久？',
    context: '其余条件相同，只比较花费和门到门时间。',
    choices: [
      { label: '不愿多花时间', value: 0 },
      { label: '最多 5 分钟', value: 0.25 },
      { label: '最多 10 分钟', value: 0.5 },
      { label: '最多 20 分钟', value: 1 },
      { label: '最多 30 分钟', value: 1.5 },
    ],
  },
  {
    key: 'walking', metric: '步行', unit: '分/分',
    title: '为了少走 10 分钟，你愿意多花多久？',
    context: '其余条件相同，多用的时间是等车或乘车时间。',
    choices: [
      { label: '我更喜欢多走一段', value: -0.2 },
      { label: '两种走法差不多', value: 0 },
      { label: '愿为少走路多用 5 分钟', value: 0.5 },
      { label: '愿为少走路多用 10 分钟', value: 1 },
      { label: '愿为少走路多用 15 分钟', value: 1.5 },
    ],
  },
  {
    key: 'transfer', metric: '换乘', unit: '分/次',
    title: '为了少换乘一次，你愿意多花多久？',
    context: '换乘时的步行和等待已算入总时间。',
    choices: [
      { label: '不会额外花时间', value: 0 },
      { label: '最多 5 分钟', value: 5 },
      { label: '最多 10 分钟', value: 10 },
      { label: '最多 15 分钟', value: 15 },
      { label: '最多 20 分钟', value: 20 },
    ],
  },
  {
    key: 'delay', metric: '不确定性', unit: '倍',
    title: '预计可能晚到 10 分钟，你有多在意？',
    context: '另一条路线更稳定，但确定会多花一些时间。',
    choices: [
      { label: '仍选较快的路线', value: 0 },
      { label: '稳定路线最多多用 5 分钟', value: 0.5 },
      { label: '稳定路线最多多用 10 分钟', value: 1 },
      { label: '稳定路线最多多用 15 分钟', value: 1.5 },
      { label: '稳定路线最多多用 20 分钟', value: 2 },
    ],
  },
  {
    key: 'stopGo', metric: '停走负担', unit: '分/级',
    title: '乘车更平顺，你愿意多用多久？',
    context: '对比两个方案，停走强度相差一级。',
    choices: [
      { label: '不会额外花时间', value: 0 },
      { label: '最多 1.5 分钟', value: 1.5 },
      { label: '最多 3 分钟', value: 3 },
      { label: '最多 4.5 分钟', value: 4.5 },
      { label: '最多 6 分钟', value: 6 },
    ],
  },
]

export function weightsFromAnswers(answers: Partial<Weights>): Weights | null {
  const weights = {} as Weights
  for (const question of preferenceQuestions) {
    const answer = answers[question.key]
    if (answer === undefined || !question.choices.some((choice) => choice.value === answer)) return null
    weights[question.key] = answer
  }
  return weights
}

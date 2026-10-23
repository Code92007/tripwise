import { describe, expect, it } from 'vitest'
import { preferenceQuestions, weightsFromAnswers } from './quizConfig'

describe('preference questionnaire', () => {
  it('converts concrete trade-offs into the five scoring weights', () => {
    expect(weightsFromAnswers({ price: 0.25, walking: -0.2, transfer: 15, delay: 1, stopGo: 3 })).toEqual({
      price: 0.25, walking: -0.2, transfer: 15, delay: 1, stopGo: 3,
    })
  })

  it('requires every answer and accepts only offered choices', () => {
    expect(weightsFromAnswers({ price: 0.5, walking: 0, transfer: 10, delay: 1 })).toBeNull()
    expect(weightsFromAnswers({ price: 99, walking: 0, transfer: 10, delay: 1, stopGo: 3 })).toBeNull()
    expect(preferenceQuestions.map((question) => question.key)).toEqual(['price', 'walking', 'transfer', 'delay', 'stopGo'])
  })
})

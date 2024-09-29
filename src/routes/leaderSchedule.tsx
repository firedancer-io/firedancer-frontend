import { createFileRoute } from '@tanstack/react-router'
import { LeaderSchedule } from '../features/LeaderSchedule'

export const Route = createFileRoute('/leaderSchedule')({
  component: LeaderSchedule
})
import { createClient } from '@connectrpc/connect'
import { transportAtom } from '@/network/transport'
import { atom } from 'jotai'

import { ActivityService } from './genproto/shared/activity/v1/activity_pb'
import { AuthService } from './genproto/public/auth/v1/auth_pb'
import { CampaignService } from './genproto/shared/campaigns/v1/campaigns_pb'
import { InsightsService } from './genproto/shared/insights/v1/insights_pb'
import { OrgsService } from './genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectsService } from './genproto/dashboard/projects/v1/projects_pb'

// Public
export const authRPCAtom = atom(get => createClient(AuthService, get(transportAtom)))

// Dashboard — org-scoped (JWT auth)
export const orgsRPCAtom = atom(get => createClient(OrgsService, get(transportAtom)))
export const projectsRPCAtom = atom(get => createClient(ProjectsService, get(transportAtom)))

// Dashboard — project-scoped (JWT auth + x-project-id header from projectHeaderAtom)
export const campaignsRPCAtom = atom(get => createClient(CampaignService, get(transportAtom)))
export const insightsRPCAtom = atom(get => createClient(InsightsService, get(transportAtom)))
export const activityRPCAtom = atom(get => createClient(ActivityService, get(transportAtom)))

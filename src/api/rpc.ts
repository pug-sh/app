import { createClient } from '@connectrpc/connect'
import { atom } from 'jotai'
import { transportAtom } from '@/network/transport'
import { DashboardsService } from './genproto/dashboard/dashboards/v1/dashboards_pb'
import { CustomersService } from './genproto/dashboard/customers/v1/customers_pb'
import { OrgsService } from './genproto/dashboard/orgs/v1/orgs_pb'
import { ProjectsService } from './genproto/dashboard/projects/v1/projects_pb'
import { AuthService } from './genproto/public/auth/v1/auth_pb'
import { ActivityService } from './genproto/shared/activity/v1/activity_pb'
import { CampaignService } from './genproto/shared/campaigns/v1/campaigns_pb'
import { InsightsService } from './genproto/shared/insights/v1/insights_pb'
import { ProfilesService } from './genproto/shared/profiles/v1/profiles_pb'

// Public
export const authRPCAtom = atom(get => createClient(AuthService, get(transportAtom)))

// Dashboard — org-scoped (JWT auth)
export const customersRPCAtom = atom(get => createClient(CustomersService, get(transportAtom)))
export const orgsRPCAtom = atom(get => createClient(OrgsService, get(transportAtom)))
export const projectsRPCAtom = atom(get => createClient(ProjectsService, get(transportAtom)))

// Dashboard — project-scoped (JWT auth + x-project-id header from projectHeaderAtom)
export const campaignsRPCAtom = atom(get => createClient(CampaignService, get(transportAtom)))
export const dashboardsRPCAtom = atom(get => createClient(DashboardsService, get(transportAtom)))
export const insightsRPCAtom = atom(get => createClient(InsightsService, get(transportAtom)))
export const activityRPCAtom = atom(get => createClient(ActivityService, get(transportAtom)))
export const profilesRPCAtom = atom(get => createClient(ProfilesService, get(transportAtom)))

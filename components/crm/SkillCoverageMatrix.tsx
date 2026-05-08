'use client'

import type { AITeamMember } from '@/types/aiTeamBuilder'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface Props {
    requiredSkillNames: string[]
    team: AITeamMember[]
}

export function SkillCoverageMatrix({ requiredSkillNames, team }: Props) {
    if (requiredSkillNames.length === 0) return null

    const coveredSkills = new Set<string>()
    const memberCoveredSkills: Record<string, Set<string>> = {}

    for (const member of team) {
        const memberSkills = new Set<string>()
        if (member.matchedSkills && Array.isArray(member.matchedSkills)) {
            for (const skill of member.matchedSkills) {
                memberSkills.add(skill.toLowerCase())
                coveredSkills.add(skill.toLowerCase())
            }
        }
        memberCoveredSkills[member.employeeId] = memberSkills
    }

    const uncovered = requiredSkillNames.filter(
        s => !coveredSkills.has(s.toLowerCase())
    )

    return (
        <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3 bg-slate-50/80 border-b border-slate-100 rounded-t-xl">
                <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    Skill Coverage Matrix
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            Covered Skills ({coveredSkills.size}/{requiredSkillNames.length})
                        </h4>
                        <div className="space-y-1.5">
                            {requiredSkillNames
                                .filter(s => coveredSkills.has(s.toLowerCase()))
                                .map(skill => (
                                    <div key={skill} className="flex items-center gap-2">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                        <span className="text-sm text-slate-700">{skill}</span>
                                    </div>
                                ))}
                        </div>
                    </div>
                    <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            Gap Skills ({uncovered.length})
                        </h4>
                        <div className="space-y-1.5">
                            {uncovered.length === 0 ? (
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                    <span className="text-sm text-slate-500">All skills covered</span>
                                </div>
                            ) : (
                                uncovered.map(skill => (
                                    <div key={skill} className="flex items-center gap-2">
                                        <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                                        <span className="text-sm text-red-700 font-medium">{skill}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {team.length > 0 && (
                    <div>
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            Team Member Coverage
                        </h4>
                        <div className="space-y-2">
                            {team.map(member => {
                                const memberSkills = memberCoveredSkills[member.employeeId] ?? new Set()
                                const score = requiredSkillNames.length > 0
                                    ? Math.round((memberSkills.size / requiredSkillNames.length) * 100)
                                    : 0
                                const matchBadge = score >= 80
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                                    : score >= 40
                                        ? 'bg-amber-100 text-amber-700 border-amber-200'
                                        : 'bg-red-100 text-red-700 border-red-200'
                                return (
                                    <div key={member.employeeId} className="flex items-center justify-between p-2 rounded border border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <div className="h-7 w-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-bold">
                                                {member.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                                            </div>
                                            <span className="text-sm font-medium text-slate-700">{member.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {memberSkills.size > 0 ? (
                                                <div className="flex flex-wrap gap-1 max-w-[200px]">
                                                    {Array.from(memberSkills).map(s => (
                                                        <Badge key={s} variant="outline" className="text-xs py-0">
                                                            {s}
                                                        </Badge>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400">No matched skills</span>
                                            )}
                                            <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${matchBadge}`}>
                                                {score}%
                                            </span>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {uncovered.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <h4 className="text-xs font-semibold text-amber-800 mb-1">Recommendations</h4>
                        <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                            <li>Consider hiring or training for: {uncovered.join(', ')}</li>
                            <li>Cross-train existing team members to fill skill gaps</li>
                            <li>Outsource or contract specialists for uncovered skills</li>
                        </ul>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
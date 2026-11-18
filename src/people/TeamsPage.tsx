/** Trang Đội ngũ: các nhóm mình tạo và các nhóm mình tham gia */
import { useState } from 'react';
import { AvatarStack } from '../components/Avatar';
import { ManageTeamDialog, NameDialog, TeamIcon } from '../components/Social';
import { useT } from '../i18n';
import type { TeamInfo } from '../sync/api';
import { createTeam, usePeople } from '../sync/people';

function TeamCard({ team, onOpen }: { team: TeamInfo; onOpen: () => void }) {
  const t = useT();
  return (
    <button type="button" className="pg-card pg-team" onClick={onOpen}>
      <span className="pg-team-ico" aria-hidden="true">
        <TeamIcon size={22} />
      </span>
      <span className="pg-team-main">
        <strong title={team.name}>{team.name}</strong>
        <small>
          {t('team.people', { n: team.members.length })} · {t('teams.projectCount', { n: team.projects.length })}
        </small>
      </span>
      <AvatarStack users={team.members} max={5} size={26} />
    </button>
  );
}

export function TeamsPage() {
  const t = useT();
  const teams = usePeople((s) => s.teams);
  const [dialog, setDialog] = useState<{ kind: 'create' } | { kind: 'manage'; id: string } | null>(null);
  const owned = teams.filter((x) => x.role === 'owner');
  const joined = teams.filter((x) => x.role !== 'owner');

  return (
    <div className="pg">
      <div className="pg-head">
        <h1>{t('teams.title')}</h1>
        <button type="button" className="btn ghost sm pg-outline" onClick={() => setDialog({ kind: 'create' })}>
          {t('side.newTeam')}
        </button>
      </div>

      {teams.length === 0 ? (
        <div className="pg-empty">
          <span className="pg-empty-art" aria-hidden="true">
            <span className="pg-empty-tile">
              <svg viewBox="0 0 48 40" width="58" height="48" fill="currentColor">
                <circle cx="15" cy="13" r="7" />
                <circle cx="33" cy="15" r="6" />
                <path d="M3 36c.6-8 5.4-12 12-12s11.4 4 12 12zM28 36c.3-5 2.8-8.4 7-8.4 5 0 8 3.6 8.6 8.4z" />
              </svg>
            </span>
            <span className="pg-empty-plus">+</span>
          </span>
          <h2>{t('teams.empty.title')}</h2>
          <p>{t('teams.empty.text')}</p>
          <button type="button" className="btn primary" onClick={() => setDialog({ kind: 'create' })}>
            {t('side.newTeam')}
          </button>
        </div>
      ) : (
        <>
          <section className="pg-sec">
            <h2>
              {t('teams.owned')} <span className="pg-count">{owned.length}</span>
            </h2>
            {owned.length === 0 ? (
              <p className="pg-none">{t('teams.noneOwned')}</p>
            ) : (
              <div className="pg-grid">
                {owned.map((x) => (
                  <TeamCard key={x.id} team={x} onOpen={() => setDialog({ kind: 'manage', id: x.id })} />
                ))}
              </div>
            )}
          </section>
          <section className="pg-sec">
            <h2>
              {t('teams.joined')} <span className="pg-count">{joined.length}</span>
            </h2>
            {joined.length === 0 ? (
              <p className="pg-none">{t('teams.noneJoined')}</p>
            ) : (
              <div className="pg-grid">
                {joined.map((x) => (
                  <TeamCard key={x.id} team={x} onOpen={() => setDialog({ kind: 'manage', id: x.id })} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {dialog?.kind === 'create' && (
        <NameDialog
          title={t('side.newTeam')}
          label={t('team.name')}
          placeholder={t('team.namePh')}
          hint={t('team.newHint')}
          submitLabel={t('social.create')}
          onClose={() => setDialog(null)}
          onSubmit={async (name) => {
            const id = await createTeam(name);
            setDialog({ kind: 'manage', id });
          }}
        />
      )}
      {dialog?.kind === 'manage' && <ManageTeamDialog teamId={dialog.id} onClose={() => setDialog(null)} />}
    </div>
  );
}

/** Trang Mọi người: bạn bè và thành viên các nhóm của mình; tìm, lọc theo nhóm, thêm người bằng email */
import { useMemo, useState } from 'react';
import { Avatar } from '../components/Avatar';
import { NameDialog } from '../components/Social';
import { useT } from '../i18n';
import type { ApiUser } from '../sync/api';
import { requestFriend, usePeople } from '../sync/people';
import { useSession } from '../sync/session';
import { toast } from '../toast';

interface Person {
  user: ApiUser;
  friend: boolean;
  teams: { id: string; name: string }[];
}

export function PeoplePage() {
  const t = useT();
  const me = useSession((s) => s.user);
  const { friends, teams, incoming } = usePeople();
  const [query, setQuery] = useState('');
  const [teamId, setTeamId] = useState('');
  const [adding, setAdding] = useState(false);

  const people = useMemo(() => {
    const map = new Map<string, Person>();
    const get = (u: ApiUser) => {
      let p = map.get(u.id);
      if (!p) map.set(u.id, (p = { user: u, friend: false, teams: [] }));
      return p;
    };
    for (const f of friends) get(f).friend = true;
    for (const tm of teams)
      for (const m of tm.members) if (m.id !== me?.id) get(m).teams.push({ id: tm.id, name: tm.name });
    return [...map.values()].sort((a, b) => (a.user.name || a.user.email).localeCompare(b.user.name || b.user.email));
  }, [friends, teams, me?.id]);

  const q = query.trim().toLowerCase();
  const shown = people.filter(
    (p) => (!teamId || p.teams.some((x) => x.id === teamId)) && (!q || `${p.user.name} ${p.user.email}`.toLowerCase().includes(q)),
  );

  return (
    <div className="pg">
      <div className="pg-head">
        <h1>{t('people.title')}</h1>
        <button type="button" className="btn primary sm" onClick={() => setAdding(true)}>
          {t('people.add')}
        </button>
      </div>

      {incoming.length > 0 && <p className="pg-note">{t('people.incoming', { n: incoming.length })}</p>}

      <div className="pg-filters">
        <label className="pg-search">
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <circle cx="7" cy="7" r="4.5" />
            <path d="M10.5 10.5 14 14" />
          </svg>
          <input type="search" value={query} placeholder={t('people.search')} aria-label={t('people.search')} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select value={teamId} aria-label={t('people.byTeam')} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">{t('people.allTeams')}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {tm.name}
            </option>
          ))}
        </select>
      </div>

      <h2 className="pg-count-line">{t('team.people', { n: shown.length })}</h2>
      {shown.length === 0 ? (
        <p className="pg-none">{people.length === 0 ? t('people.empty') : t('people.noMatch')}</p>
      ) : (
        <div className="pg-grid">
          {shown.map((p) => (
            <div key={p.user.id} className="pg-card pg-person">
              <Avatar user={p.user} size={56} />
              <div className="pg-person-main">
                <strong title={p.user.name || p.user.email}>{p.user.name || p.user.email.split('@')[0]}</strong>
                <small title={p.user.email}>{p.user.email}</small>
                <span className="pg-chips">
                  {p.friend && <span className="pg-chip is-friend">{t('people.friend')}</span>}
                  {p.teams.map((x) => (
                    <span key={x.id} className="pg-chip">
                      {x.name}
                    </span>
                  ))}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <NameDialog
          title={t('people.add')}
          label={t('people.email')}
          placeholder="name@company.com"
          hint={t('people.addHint')}
          submitLabel={t('people.send')}
          onClose={() => setAdding(false)}
          onSubmit={async (email) => {
            const r = await requestFriend(email);
            toast.success(r.status === 'accepted' ? 'social.nowFriends' : 'social.requestSent', { name: r.user.name || r.user.email });
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

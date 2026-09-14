/* ============================================================
   RF9 CRM — dashboard logic
   ============================================================
   Every read/write here is subject to Supabase Row Level Security:
   this file has no special privileges of its own. If the signed-in
   user isn't an active staff profile, every query below simply
   returns zero rows — the auth guard just makes that state legible
   instead of a blank screen.
   ============================================================ */
(function () {
  'use strict';

  var sb = window.rf9Supabase;
  var PAGE_SIZE = 20;
  var KNOWN_PROGRAMS = [
    'CrossFit', 'Functional Fitness', 'Strength & Conditioning',
    'Personal Coaching', 'RF9 App — Online Coaching', 'Not sure yet'
  ];

  var state = {
    session: null,
    userId: null,
    statuses: [],           // [{id,name,color,sort_order,is_default}]
    statusById: {},
    page: 0,
    total: 0,
    filters: { search: '', status: '', program: '', source: '', date: '' },
    activeLeadId: null
  };

  var $ = function (id) { return document.getElementById(id); };

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(message, isError) {
    var el = $('toast');
    el.textContent = message;
    el.className = 'toast is-visible' + (isError ? ' is-error' : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.classList.remove('is-visible'); }, 3200);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function fmtShortDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /* ------------------------------------------------------------
     AUTH GUARD
     ------------------------------------------------------------ */
  function boot() {
    sb.auth.getSession().then(function (res) {
      var session = res.data && res.data.session;
      if (!session) {
        window.location.replace('/admin/login.html');
        return;
      }
      state.session = session;
      state.userId = session.user.id;
      loadProfileThenApp();
    }).catch(function () {
      window.location.replace('/admin/login.html');
    });

    sb.auth.onAuthStateChange(function (event) {
      if (event === 'SIGNED_OUT') window.location.replace('/admin/login.html');
    });
  }

  function loadProfileThenApp() {
    sb.from('profiles').select('full_name,email,role,is_active').eq('id', state.userId).single()
      .then(function (res) {
        var profile = res.data;
        if (!profile || !profile.is_active) {
          $('pendingState').classList.remove('hidden');
          return;
        }
        $('userLabel').textContent = profile.full_name || profile.email || state.session.user.email;
        $('app').classList.remove('hidden');
        initApp();
      })
      .catch(function () {
        $('pendingState').classList.remove('hidden');
      });
  }

  $('pendingSignOut') && $('pendingSignOut').addEventListener('click', function () {
    sb.auth.signOut().then(function () { window.location.replace('/admin/login.html'); });
  });
  $('signOutBtn').addEventListener('click', function () {
    sb.auth.signOut().then(function () { window.location.replace('/admin/login.html'); });
  });

  /* ------------------------------------------------------------
     APP INIT
     ------------------------------------------------------------ */
  function initApp() {
    loadStatuses()
      .then(populateStatusFilter)
      .then(populateProgramFilter)
      .then(loadStats)
      .then(loadLeads)
      .catch(function (err) {
        console.error('[RF9 CRM] init failed:', err);
        toast('Something went wrong loading the dashboard.', true);
      });

    wireToolbar();
    wireDrawer();

    $('refreshBtn').addEventListener('click', function () {
      loadStats();
      loadLeads();
    });
  }

  function loadStatuses() {
    return sb.from('lead_statuses').select('id,name,color,sort_order,is_default').order('sort_order')
      .then(function (res) {
        if (res.error) throw res.error;
        state.statuses = res.data || [];
        state.statusById = {};
        state.statuses.forEach(function (s) { state.statusById[s.id] = s; });
      });
  }

  function populateStatusFilter() {
    var sel = $('statusFilter');
    state.statuses.forEach(function (s) {
      var opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      sel.appendChild(opt);
    });
  }

  function populateProgramFilter() {
    var sel = $('programFilter');
    var sourceSel = $('sourceFilter');

    KNOWN_PROGRAMS.forEach(function (p) {
      var opt = document.createElement('option');
      opt.value = p; opt.textContent = p;
      sel.appendChild(opt);
    });

    // Merge in any distinct programs/sources actually seen in the data
    // (covers older or manually-entered leads outside the known set).
    return Promise.all([
      sb.from('leads').select('selected_program').not('selected_program', 'is', null),
      sb.from('leads').select('lead_source').not('lead_source', 'is', null)
    ]).then(function (results) {
      var programs = uniqueSorted((results[0].data || []).map(function (r) { return r.selected_program; }));
      var sources = uniqueSorted((results[1].data || []).map(function (r) { return r.lead_source; }));

      programs.forEach(function (p) {
        if (KNOWN_PROGRAMS.indexOf(p) !== -1) return;
        var opt = document.createElement('option');
        opt.value = p; opt.textContent = p;
        sel.appendChild(opt);
      });
      sources.forEach(function (s) {
        var opt = document.createElement('option');
        opt.value = s; opt.textContent = s;
        sourceSel.appendChild(opt);
      });
    }).catch(function (err) {
      console.error('[RF9 CRM] filter option load failed:', err);
    });
  }

  function uniqueSorted(arr) {
    var seen = {}, out = [];
    arr.forEach(function (v) {
      if (v && !seen[v]) { seen[v] = true; out.push(v); }
    });
    return out.sort();
  }

  /* ------------------------------------------------------------
     STATS
     ------------------------------------------------------------ */
  function loadStats() {
    return sb.from('leads').select('status_id').then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      var total = rows.length;
      var counts = {};
      rows.forEach(function (r) {
        counts[r.status_id] = (counts[r.status_id] || 0) + 1;
      });

      var convertedStatus = state.statuses.filter(function (s) { return s.name === 'CONVERTED'; })[0];
      var converted = convertedStatus ? (counts[convertedStatus.id] || 0) : 0;
      var rate = total > 0 ? Math.round((converted / total) * 1000) / 10 : 0;

      var tiles = [{ label: 'Total Leads', value: total, accent: false }];
      state.statuses.forEach(function (s) {
        tiles.push({ label: s.name, value: counts[s.id] || 0 });
      });
      tiles.push({ label: 'Conversion Rate', value: total > 0 ? rate + '%' : '—', rate: true });

      $('statsRow').innerHTML = tiles.map(function (t) {
        var cls = 'stat' + (t.rate ? ' stat--rate' : '');
        return '<div class="' + cls + '"><div class="stat__label">' + escapeHtml(t.label) +
          '</div><div class="stat__value">' + escapeHtml(t.value) + '</div></div>';
      }).join('');
    }).catch(function (err) {
      console.error('[RF9 CRM] stats load failed:', err);
      $('statsRow').innerHTML = '';
    });
  }

  /* ------------------------------------------------------------
     TOOLBAR / FILTERS
     ------------------------------------------------------------ */
  function wireToolbar() {
    var searchTimer;
    $('searchInput').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var val = e.target.value;
      searchTimer = setTimeout(function () {
        state.filters.search = val.trim();
        state.page = 0;
        loadLeads();
      }, 300);
    });

    ['statusFilter', 'programFilter', 'sourceFilter', 'dateFilter'].forEach(function (id) {
      $(id).addEventListener('change', function (e) {
        var key = id.replace('Filter', '');
        state.filters[key] = e.target.value;
        state.page = 0;
        loadLeads();
      });
    });

    $('resetFilters').addEventListener('click', function (e) {
      e.preventDefault();
      state.filters = { search: '', status: '', program: '', source: '', date: '' };
      state.page = 0;
      $('searchInput').value = '';
      $('statusFilter').value = '';
      $('programFilter').value = '';
      $('sourceFilter').value = '';
      $('dateFilter').value = '';
      loadLeads();
    });
  }

  function dateFilterCutoff(key) {
    var now = new Date();
    if (key === 'today') {
      var d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return d.toISOString();
    }
    if (key === '7') return new Date(now.getTime() - 7 * 864e5).toISOString();
    if (key === '30') return new Date(now.getTime() - 30 * 864e5).toISOString();
    if (key === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    return null;
  }

  function sanitizeSearchTerm(s) {
    return s.replace(/[%_,()*]/g, ' ').trim();
  }

  /* ------------------------------------------------------------
     LEADS TABLE
     ------------------------------------------------------------ */
  function loadLeads() {
    var tbody = $('leadsTbody');
    var cards = $('leadCards');
    var tableState = $('tableState');
    var cardState = $('cardState');

    tableState.classList.add('hidden');
    cardState.classList.add('hidden');

    var q = sb.from('leads')
      .select('id,name,phone,email,selected_program,lead_source,created_at,updated_at,status_id,lead_statuses(name,color)', { count: 'exact' });

    var f = state.filters;
    if (f.search) {
      var term = sanitizeSearchTerm(f.search);
      if (term) {
        q = q.or('name.ilike.*' + term + '*,phone.ilike.*' + term + '*,email.ilike.*' + term + '*');
      }
    }
    if (f.status) q = q.eq('status_id', f.status);
    if (f.program) q = q.eq('selected_program', f.program);
    if (f.source) q = q.eq('lead_source', f.source);
    if (f.date) {
      var cutoff = dateFilterCutoff(f.date);
      if (cutoff) q = q.gte('created_at', cutoff);
    }

    var from = state.page * PAGE_SIZE;
    q = q.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);

    q.then(function (res) {
      if (res.error) throw res.error;
      var rows = res.data || [];
      state.total = res.count || 0;

      var hasFilters = !!(f.search || f.status || f.program || f.source || f.date);
      $('resultCount').textContent = state.total === 0 ? '' :
        state.total + (state.total === 1 ? ' lead' : ' leads');

      if (rows.length === 0) {
        tbody.innerHTML = '';
        cards.innerHTML = '';
        var msg = hasFilters
          ? { t: 'No leads match your search.', s: 'Try a different search term or clear your filters.' }
          : { t: 'No leads yet.', s: 'New RF9 inquiries will appear here automatically.' };
        [tableState, cardState].forEach(function (el) {
          el.classList.remove('hidden');
          el.classList.add('state');
          el.innerHTML = '<p class="state__title">' + escapeHtml(msg.t) + '</p><p class="state__sub">' + escapeHtml(msg.s) + '</p>';
        });
        $('pagination').classList.add('hidden');
        return;
      }

      tbody.innerHTML = rows.map(renderRow).join('');
      cards.innerHTML = rows.map(renderCard).join('');
      renderPagination();

      Array.prototype.forEach.call(document.querySelectorAll('[data-lead-id]'), function (el) {
        el.addEventListener('click', function () { openLead(el.getAttribute('data-lead-id')); });
      });
    }).catch(function (err) {
      console.error('[RF9 CRM] leads load failed:', err);
      tbody.innerHTML = '';
      cards.innerHTML = '';
      [tableState, cardState].forEach(function (el) {
        el.classList.remove('hidden');
        el.className = 'state state--error';
        el.innerHTML = '<p class="state__title">Couldn’t load leads.</p><p class="state__sub">Please refresh the page or try again shortly.</p>';
      });
      $('pagination').classList.add('hidden');
    });
  }

  function statusBadge(status) {
    if (!status) return '<span class="badge" style="background:#EEF0F5;color:#767C93"><i></i>&mdash;</span>';
    var color = status.color || '#767C93';
    return '<span class="badge" style="background:' + color + '1A;color:' + color + '"><i></i>' + escapeHtml(status.name) + '</span>';
  }

  function renderRow(l) {
    return '<tr data-lead-id="' + l.id + '">' +
      '<td class="cell-name">' + escapeHtml(l.name) + '</td>' +
      '<td class="cell-phone">' + (l.phone ? '<a href="tel:' + escapeHtml(l.phone) + '" onclick="event.stopPropagation()">' + escapeHtml(l.phone) + '</a>' : '<span class="cell-muted">—</span>') + '</td>' +
      '<td class="cell-muted">' + escapeHtml(l.email || '—') + '</td>' +
      '<td>' + escapeHtml(l.selected_program || '—') + '</td>' +
      '<td>' + statusBadge(l.lead_statuses) + '</td>' +
      '<td><span class="source-chip">' + escapeHtml(l.lead_source || 'Direct') + '</span></td>' +
      '<td class="cell-nowrap cell-muted">' + fmtShortDate(l.created_at) + '</td>' +
      '<td class="cell-nowrap cell-muted">' + fmtShortDate(l.updated_at) + '</td>' +
      '</tr>';
  }

  function renderCard(l) {
    return '<div class="lead-card" data-lead-id="' + l.id + '">' +
      '<div class="lead-card__top"><span class="lead-card__name">' + escapeHtml(l.name) + '</span>' + statusBadge(l.lead_statuses) + '</div>' +
      '<div class="lead-card__meta">' +
      (l.phone ? '<a href="tel:' + escapeHtml(l.phone) + '" onclick="event.stopPropagation()">' + escapeHtml(l.phone) + '</a>' : '') +
      '<span>' + escapeHtml(l.selected_program || '—') + '</span>' +
      '<span class="source-chip">' + escapeHtml(l.lead_source || 'Direct') + '</span>' +
      '</div>' +
      '<div class="lead-card__foot"><span>Submitted ' + fmtShortDate(l.created_at) + '</span></div>' +
      '</div>';
  }

  function renderPagination() {
    var totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
    var current = state.page + 1;
    var el = $('pagination');
    el.classList.remove('hidden');
    el.innerHTML =
      '<span>Page ' + current + ' of ' + totalPages + '</span>' +
      '<div style="display:flex;gap:8px">' +
      '<button class="btn btn--sm" id="pgPrev"' + (current <= 1 ? ' disabled' : '') + '>Previous</button>' +
      '<button class="btn btn--sm" id="pgNext"' + (current >= totalPages ? ' disabled' : '') + '>Next</button>' +
      '</div>';
    var prev = $('pgPrev'), next = $('pgNext');
    if (prev) prev.addEventListener('click', function () { state.page--; loadLeads(); window.scrollTo(0, 0); });
    if (next) next.addEventListener('click', function () { state.page++; loadLeads(); window.scrollTo(0, 0); });
  }

  /* ------------------------------------------------------------
     LEAD DETAIL DRAWER
     ------------------------------------------------------------ */
  function wireDrawer() {
    $('drawerClose').addEventListener('click', closeDrawer);
    $('drawerOverlay').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('drawer').classList.contains('is-open')) closeDrawer();
    });
  }

  function openDrawerShell() {
    $('drawerOverlay').classList.add('is-open');
    $('drawer').classList.add('is-open');
    $('drawer').setAttribute('aria-hidden', 'false');
  }
  function closeDrawer() {
    $('drawerOverlay').classList.remove('is-open');
    $('drawer').classList.remove('is-open');
    $('drawer').setAttribute('aria-hidden', 'true');
    state.activeLeadId = null;
  }

  function openLead(id) {
    state.activeLeadId = id;
    $('drawerName').textContent = 'Loading…';
    $('drawerMeta').textContent = '';
    $('drawerActions').innerHTML = '';
    $('drawerBody').innerHTML = '';
    openDrawerShell();
    refreshDrawer(id);
  }

  function refreshDrawer(id) {
    Promise.all([
      sb.from('leads').select('*, lead_statuses(name,color)').eq('id', id).single(),
      sb.from('lead_notes').select('id,content,created_at,edited_at,profiles(full_name,email)').eq('lead_id', id).order('created_at', { ascending: false }),
      sb.from('lead_activity').select('id,event_type,details,created_at,profiles(full_name,email)').eq('lead_id', id).order('created_at', { ascending: false })
    ]).then(function (results) {
      var leadRes = results[0], notesRes = results[1], activityRes = results[2];
      if (leadRes.error || !leadRes.data) throw leadRes.error || new Error('Lead not found');
      renderDrawer(leadRes.data, notesRes.data || [], activityRes.data || []);
    }).catch(function (err) {
      console.error('[RF9 CRM] lead detail load failed:', err);
      $('drawerName').textContent = 'Couldn’t load lead';
      $('drawerBody').innerHTML = '<div class="state state--error"><p class="state__title">Something went wrong.</p><p class="state__sub">Please close this panel and try again.</p></div>';
    });
  }

  function activityText(a) {
    var who = a.profiles ? (a.profiles.full_name || a.profiles.email) : 'System';
    var d = a.details || {};
    switch (a.event_type) {
      case 'created': return 'Lead submitted via the RF9 website';
      case 'status_changed': return who + ' changed status from ' + (d.from || '—') + ' to ' + (d.to || '—');
      case 'program_changed': return who + ' changed program from “' + (d.from || '—') + '” to “' + (d.to || '—') + '”';
      case 'admin_assigned': return who + ' updated the assigned staff member';
      case 'message_updated': return who + ' updated the lead’s contact details';
      case 'note_added': return who + ' added a note: “' + (d.preview || '') + '”';
      case 'lead_merged': return 'Repeat inquiry merged into this lead (matched by ' + (d.matched_by || 'contact info') + ')';
      default: return who + ' updated this lead';
    }
  }

  function renderDrawer(lead, notes, activity) {
    $('drawerName').textContent = lead.name;
    $('drawerMeta').textContent = 'Lead #' + lead.id.slice(0, 8);

    var actions = [];
    if (lead.phone) actions.push('<a class="btn btn--sm" href="tel:' + escapeHtml(lead.phone) + '">Call</a>');
    if (lead.email) actions.push('<a class="btn btn--sm" href="mailto:' + escapeHtml(lead.email) + '">Email</a>');
    $('drawerActions').innerHTML = actions.join('');

    var statusOptions = state.statuses.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === lead.status_id ? ' selected' : '') + '>' + escapeHtml(s.name) + '</option>';
    }).join('');

    var utmRows = ['utm_source', 'utm_medium', 'utm_campaign', 'referrer'].filter(function (k) { return lead[k]; });

    var html = '';

    html += '<div class="drawer__section">' +
      '<p class="drawer__section-title">Contact</p>' +
      '<dl class="kv">' +
      '<dt>Name</dt><dd>' + escapeHtml(lead.name) + '</dd>' +
      '<dt>Phone</dt><dd>' + (lead.phone ? '<a href="tel:' + escapeHtml(lead.phone) + '">' + escapeHtml(lead.phone) + '</a>' : '—') + '</dd>' +
      '<dt>Email</dt><dd>' + (lead.email ? '<a href="mailto:' + escapeHtml(lead.email) + '">' + escapeHtml(lead.email) + '</a>' : '—') + '</dd>' +
      '</dl></div>';

    html += '<div class="drawer__section">' +
      '<p class="drawer__section-title">Interest</p>' +
      '<dl class="kv"><dt>Program</dt><dd>' + escapeHtml(lead.selected_program || '—') + '</dd></dl>' +
      (lead.message ? '<div class="msg-box" style="margin-top:10px">' + escapeHtml(lead.message) + '</div>' : '') +
      '</div>';

    html += '<div class="drawer__section">' +
      '<p class="drawer__section-title">Source</p>' +
      '<dl class="kv">' +
      '<dt>Lead Source</dt><dd>' + escapeHtml(lead.lead_source || 'Direct') + '</dd>' +
      (lead.utm_source ? '<dt>UTM Source</dt><dd>' + escapeHtml(lead.utm_source) + '</dd>' : '') +
      (lead.utm_medium ? '<dt>UTM Medium</dt><dd>' + escapeHtml(lead.utm_medium) + '</dd>' : '') +
      (lead.utm_campaign ? '<dt>UTM Campaign</dt><dd>' + escapeHtml(lead.utm_campaign) + '</dd>' : '') +
      (lead.referrer ? '<dt>Referrer</dt><dd style="word-break:break-all">' + escapeHtml(lead.referrer) + '</dd>' : '') +
      '</dl></div>';

    html += '<div class="drawer__section">' +
      '<p class="drawer__section-title">Status</p>' +
      '<div class="status-row"><select id="statusSelect">' + statusOptions + '</select></div>' +
      '</div>';

    html += '<div class="drawer__section">' +
      '<p class="drawer__section-title">Notes</p>' +
      '<div class="notes-list" id="notesList">' + renderNotes(notes) + '</div>' +
      '<form class="note-form" id="noteForm">' +
      '<textarea id="noteContent" placeholder="Add a note — e.g. “Called Ahmed, interested in CrossFit, wants to visit this week.”" required></textarea>' +
      '<button class="btn btn--primary btn--sm" type="submit">Add Note</button>' +
      '</form></div>';

    html += '<div class="drawer__section">' +
      '<p class="drawer__section-title">Activity</p>' +
      '<div class="timeline">' + renderTimeline(activity) + '</div>' +
      '</div>';

    html += '<div class="drawer__section">' +
      '<dl class="kv">' +
      '<dt>Submitted</dt><dd>' + fmtDate(lead.created_at) + '</dd>' +
      '<dt>Last Updated</dt><dd>' + fmtDate(lead.updated_at) + '</dd>' +
      '</dl></div>';

    $('drawerBody').innerHTML = html;

    $('statusSelect').addEventListener('change', function (e) {
      updateStatus(lead.id, e.target.value);
    });
    $('noteForm').addEventListener('submit', function (e) {
      e.preventDefault();
      addNote(lead.id);
    });
  }

  function renderNotes(notes) {
    if (!notes.length) {
      return '<p class="state__sub" style="text-align:left;padding:0">No notes have been added yet.</p>';
    }
    return notes.map(function (n) {
      var who = n.profiles ? (n.profiles.full_name || n.profiles.email) : 'Staff';
      return '<div class="note"><p class="note__content">' + escapeHtml(n.content) + '</p>' +
        '<p class="note__meta">' + escapeHtml(who) + ' · ' + fmtDate(n.created_at) + '</p></div>';
    }).join('');
  }

  function renderTimeline(activity) {
    if (!activity.length) {
      return '<p class="state__sub" style="text-align:left;padding:0">No activity recorded yet.</p>';
    }
    return activity.map(function (a) {
      return '<div class="tl-item"><span class="tl-item__dot"></span>' +
        '<div class="tl-item__body"><div class="tl-item__text">' + escapeHtml(activityText(a)) + '</div>' +
        '<div class="tl-item__time">' + fmtDate(a.created_at) + '</div></div></div>';
    }).join('');
  }

  function updateStatus(leadId, statusId) {
    sb.from('leads').update({ status_id: statusId }).eq('id', leadId).select('id').then(function (res) {
      if (res.error) {
        toast('Couldn’t update status. Please try again.', true);
        console.error('[RF9 CRM] status update failed:', res.error);
        return;
      }
      // RLS silently filters out disallowed writes rather than erroring —
      // zero rows back means the account's role doesn't permit this.
      if (!res.data || res.data.length === 0) {
        toast('Your account doesn’t have permission to change lead status.', true);
        refreshDrawer(leadId);
        return;
      }
      toast('Status updated.');
      refreshDrawer(leadId);
      loadStats();
      loadLeads();
    });
  }

  function addNote(leadId) {
    var textarea = $('noteContent');
    var content = textarea.value.trim();
    if (!content) return;
    var btn = document.querySelector('#noteForm button');
    btn.disabled = true;

    sb.from('lead_notes').insert({ lead_id: leadId, author_id: state.userId, content: content }).select('id').then(function (res) {
      btn.disabled = false;
      if (res.error) {
        toast('Couldn’t save that note. Please try again.', true);
        console.error('[RF9 CRM] note insert failed:', res.error);
        return;
      }
      if (!res.data || res.data.length === 0) {
        toast('Your account doesn’t have permission to add notes.', true);
        return;
      }
      toast('Note added.');
      refreshDrawer(leadId);
      loadLeads();
    });
  }

  boot();
})();

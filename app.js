/* =========================================================================
   Suivi chirurgical – Application logic
   ========================================================================= */
(async function () {
  'use strict';

  // ── Presets ──────────────────────────────────────────────────────────────
  const INDICATIONS = [
    'Cataracte',
    'Décollement de rétine',
    'Membrane épi-rétinienne',
    'Trou maculaire',
    'Hémorragie intra-vitréenne',
    'Rétinopathie diabétique proliférante',
    'Endophtalmie',
    'Luxation IOL / cristallin',
    'Œdème maculaire',
    'Traction vitréo-maculaire',
    'Corps flottants',
    'Autre',
  ];

  const GESTURES_CATARACTE = [
    'Phacoémulsification + IOL en sac',
    'Phacoémulsification + IOL sulcus',
    'Phacoémulsification + anneau de tension capsulaire',
    'ECCE',
    'MSICS',
    'Implantation secondaire',
    'Iridectomie',
    'Synéchiolyse',
    'Capsulotomie au vitréotome',
  ];

  const GESTURES_VR = [
    'Vitrectomie 23G',
    'Vitrectomie 25G',
    'Vitrectomie 27G',
    'Pelage MLI',
    'Pelage membrane épi-rétinienne',
    'Tamponnement SF6',
    'Tamponnement C2F6',
    'Tamponnement C3F8',
    'Tamponnement huile de silicone',
    'Ablation huile de silicone',
    'Cerclage scléral',
    'Indentation segmentaire',
    'Endolaser',
    'Cryoapplication',
    'Rétinopexie pneumatique',
    'Échange fluide-air',
    'Injection intravitréenne',
    'Suture sclérale IOL',
  ];

  const EYES = ['OD', 'OS', 'ODG'];

  // ── State ───────────────────────────────────────────────────────────────
  let selectedPatientId = null;

  // ── DOM refs ────────────────────────────────────────────────────────────
  const $list = document.getElementById('patient-list');
  const $detail = document.getElementById('patient-detail');
  const $search = document.getElementById('search');
  const $filterType = document.getElementById('filter-type');
  const $count = document.getElementById('patient-count');
  const $modal = document.getElementById('modal-container');

  // ── Init ────────────────────────────────────────────────────────────────
  await db.open();
  refreshList();

  // ── Global listeners ────────────────────────────────────────────────────
  document.getElementById('btn-new-patient').addEventListener('click', () => openPatientForm());
  document.getElementById('btn-export').addEventListener('click', exportData);
  document.getElementById('btn-import').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', importData);
  $search.addEventListener('input', refreshList);
  $filterType.addEventListener('change', refreshList);

  // close modal on backdrop click
  $modal.addEventListener('click', (e) => {
    if (e.target === $modal) closeModal();
  });
  // close modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Patient list ────────────────────────────────────────────────────────
  async function refreshList() {
    const patients = await db.getAll(DB_STORES.patients);
    const q = ($search.value || '').toLowerCase().trim();
    const typeFilter = $filterType.value;

    let filtered = patients;
    if (q) {
      filtered = filtered.filter(
        (p) =>
          (p.lastName || '').toLowerCase().includes(q) ||
          (p.firstName || '').toLowerCase().includes(q) ||
          (p.indication || '').toLowerCase().includes(q)
      );
    }
    if (typeFilter) {
      filtered = filtered.filter((p) => classifyType(p) === typeFilter);
    }

    filtered.sort((a, b) => {
      const da = a.surgeryDate || '';
      const db2 = b.surgeryDate || '';
      return db2.localeCompare(da); // most recent first
    });

    $list.innerHTML = '';
    filtered.forEach((p) => {
      const li = document.createElement('li');
      li.dataset.id = p.id;
      if (p.id === selectedPatientId) li.classList.add('active');
      const eye = p.eye ? `<span class="patient-tag">${esc(p.eye)}</span>` : '';
      const ind = p.indication ? `<span class="patient-tag">${esc(p.indication)}</span>` : '';
      li.innerHTML = `
        <div class="patient-name">${esc(p.lastName || '')} ${esc(p.firstName || '')}</div>
        <div class="patient-meta">
          ${eye}${ind}
          ${p.surgeryDate ? formatDate(p.surgeryDate) : ''}
        </div>`;
      li.addEventListener('click', () => selectPatient(p.id));
      $list.appendChild(li);
    });

    const n = filtered.length;
    $count.textContent = n === 0 ? 'Aucun patient' : n === 1 ? '1 patient' : `${n} patients`;
  }

  function classifyType(p) {
    const ind = (p.indication || '').toLowerCase();
    if (ind.includes('cataracte')) return 'cataracte';
    const vrKeywords = [
      'rétine', 'rétinien', 'vitré', 'maculaire', 'trou', 'membrane',
      'hémorragie', 'endophtalmie', 'luxation', 'décollement',
      'traction', 'corps flottant', 'flottants',
    ];
    if (vrKeywords.some((k) => ind.includes(k))) return 'vr';
    return 'autre';
  }

  async function selectPatient(id) {
    selectedPatientId = id;
    await refreshList();
    await renderDetail(id);
  }

  // ── Detail view ─────────────────────────────────────────────────────────
  async function renderDetail(id) {
    const p = await db.get(DB_STORES.patients, id);
    if (!p) {
      $detail.innerHTML = '<div class="empty-state"><p>Patient introuvable.</p></div>';
      return;
    }
    const followups = await db.getAllByIndex(DB_STORES.followups, 'patientId', id);
    followups.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const media = await db.getAllByIndex(DB_STORES.media, 'patientId', id);

    const age = p.dob ? computeAge(p.dob) : null;
    const eyeClass = (p.eye || '').toLowerCase().replace('/', '');
    const surgeryMs = p.surgeryDate ? new Date(p.surgeryDate).getTime() : null;

    const earlyFollowups = followups.filter((f) => {
      if (!surgeryMs || !f.date) return true;
      return new Date(f.date).getTime() - surgeryMs < 30 * 24 * 3600 * 1000;
    });
    const lateFollowups = followups.filter((f) => {
      if (!surgeryMs || !f.date) return false;
      return new Date(f.date).getTime() - surgeryMs >= 30 * 24 * 3600 * 1000;
    });

    $detail.innerHTML = `
      <div class="detail-header">
        <div>
          <h2>${esc(p.lastName || '')} ${esc(p.firstName || '')}</h2>
          <div class="meta">
            ${p.dob ? `Né(e) le ${formatDate(p.dob)}` : ''}
            ${age !== null ? ` (${age} ans)` : ''}
            ${p.eye ? ` &mdash; <span class="tag side-${eyeClass}">${esc(p.eye)}</span>` : ''}
          </div>
        </div>
        <div class="header-actions">
          <button class="btn btn-sm" data-action="edit-patient">Modifier</button>
          <button class="btn btn-sm btn-danger" data-action="delete-patient">Supprimer</button>
        </div>
      </div>

      <!-- Surgery info -->
      <div class="section">
        <div class="section-header"><h3>Intervention</h3></div>
        <div class="section-content info-grid">
          <div class="info-item">
            <div class="label">Date de chirurgie</div>
            <div class="value ${p.surgeryDate ? '' : 'empty'}">${p.surgeryDate ? formatDate(p.surgeryDate) : 'Non renseigné'}</div>
          </div>
          <div class="info-item">
            <div class="label">Indication</div>
            <div class="value ${p.indication ? '' : 'empty'}">${esc(p.indication || 'Non renseigné')}</div>
          </div>
          <div class="info-item">
            <div class="label">Aide opératoire</div>
            <div class="value ${p.aide ? '' : 'empty'}">${esc(p.aide || 'Non renseigné')}</div>
          </div>
          <div class="info-item" style="grid-column: 1 / -1">
            <div class="label">Geste(s) chirurgical(aux)</div>
            <div class="value">
              ${(p.gestures && p.gestures.length)
                ? '<div class="tag-list">' + p.gestures.map((g) => `<span class="tag">${esc(g)}</span>`).join('') + '</div>'
                : '<span class="empty">Aucun geste renseigné</span>'}
            </div>
          </div>
          ${p.comments ? `
          <div class="info-item" style="grid-column: 1 / -1">
            <div class="label">Commentaires</div>
            <div class="value">${esc(p.comments)}</div>
          </div>` : ''}
        </div>
      </div>

      <!-- Early follow-ups -->
      <div class="section">
        <div class="section-header">
          <h3>Suivi post-opératoire précoce (&lt; M1)</h3>
          <button class="btn btn-sm btn-primary" data-action="add-followup" data-phase="early">+ Ajouter</button>
        </div>
        <div class="section-content">
          ${earlyFollowups.length
            ? '<div class="followup-list">' + earlyFollowups.map((f) => renderFollowupCard(f, surgeryMs)).join('') + '</div>'
            : '<p class="text-muted">Aucune consultation enregistrée.</p>'}
        </div>
      </div>

      <!-- Late follow-ups -->
      <div class="section">
        <div class="section-header">
          <h3>Évolution long terme (&gt; M1)</h3>
          <button class="btn btn-sm btn-primary" data-action="add-followup" data-phase="long">+ Ajouter</button>
        </div>
        <div class="section-content">
          ${lateFollowups.length
            ? '<div class="followup-list">' + lateFollowups.map((f) => renderFollowupCard(f, surgeryMs)).join('') + '</div>'
            : '<p class="text-muted">Aucune consultation enregistrée.</p>'}
        </div>
      </div>

      <!-- Media -->
      <div class="section">
        <div class="section-header">
          <h3>Images & Vidéos</h3>
          <button class="btn btn-sm btn-primary" data-action="add-media">+ Ajouter</button>
        </div>
        <div class="section-content">
          ${media.length
            ? '<div class="media-grid" id="media-grid"></div>'
            : '<p class="text-muted">Aucun fichier joint.</p>'}
        </div>
      </div>`;

    // Wire up buttons via delegation
    $detail.querySelector('[data-action="edit-patient"]').addEventListener('click', () => openPatientForm(p));
    $detail.querySelector('[data-action="delete-patient"]').addEventListener('click', () => confirmDeletePatient(p));
    $detail.querySelectorAll('[data-action="add-followup"]').forEach((btn) =>
      btn.addEventListener('click', () => openFollowupForm(p.id))
    );
    $detail.querySelectorAll('[data-action="edit-followup"]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        const fu = await db.get(DB_STORES.followups, Number(btn.dataset.fid));
        if (fu) openFollowupForm(p.id, fu);
      })
    );
    $detail.querySelectorAll('[data-action="delete-followup"]').forEach((btn) =>
      btn.addEventListener('click', async () => {
        if (confirm('Supprimer cette consultation ?')) {
          await db.remove(DB_STORES.followups, Number(btn.dataset.fid));
          renderDetail(id);
          toast('Consultation supprimée');
        }
      })
    );
    const addMediaBtn = $detail.querySelector('[data-action="add-media"]');
    if (addMediaBtn) addMediaBtn.addEventListener('click', () => openMediaUpload(p.id));

    // Render media tiles
    if (media.length) {
      const grid = document.getElementById('media-grid');
      media.forEach((m) => {
        const tile = document.createElement('div');
        tile.className = 'media-tile';
        const url = URL.createObjectURL(m.blob);
        if (m.type === 'video') {
          tile.innerHTML = `
            <video src="${url}" muted preload="metadata"></video>
            <span class="media-badge">Vidéo</span>`;
        } else {
          tile.innerHTML = `<img src="${url}" alt="${esc(m.description || m.filename || '')}" loading="lazy" />`;
        }
        tile.innerHTML += `
          <div class="media-label">${esc(m.description || m.filename || 'Fichier')}</div>
          <button class="media-delete" title="Supprimer">&times;</button>`;
        tile.querySelector('.media-delete').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (confirm('Supprimer ce fichier ?')) {
            await db.remove(DB_STORES.media, m.id);
            URL.revokeObjectURL(url);
            renderDetail(id);
            toast('Fichier supprimé');
          }
        });
        tile.addEventListener('click', () => openMediaViewer(m, url));
        grid.appendChild(tile);
      });
    }
  }

  function renderFollowupCard(f, surgeryMs) {
    const delay = surgeryMs && f.date ? formatDelay(surgeryMs, new Date(f.date).getTime()) : '';
    return `
      <div class="followup-card">
        <div class="followup-header">
          <div>
            <span class="followup-date">${f.date ? formatDate(f.date) : 'Date inconnue'}</span>
            ${delay ? `<span class="followup-delay">(${delay})</span>` : ''}
          </div>
          <div class="followup-actions">
            <button class="btn btn-sm btn-ghost" data-action="edit-followup" data-fid="${f.id}">Modifier</button>
            <button class="btn btn-sm btn-ghost" data-action="delete-followup" data-fid="${f.id}" style="color:var(--danger)">Suppr.</button>
          </div>
        </div>
        <div class="followup-body">
          ${renderMeasurements(f)}
          ${f.notes ? `<div class="followup-notes">${esc(f.notes)}</div>` : ''}
        </div>
      </div>`;
  }

  function renderMeasurements(f) {
    const items = [];
    if (f.avOD) items.push(`AV OD: ${esc(f.avOD)}`);
    if (f.avOS) items.push(`AV OS: ${esc(f.avOS)}`);
    if (f.tonusOD) items.push(`TO OD: ${esc(f.tonusOD)}`);
    if (f.tonusOS) items.push(`TO OS: ${esc(f.tonusOS)}`);
    if (f.oct) items.push(`OCT: ${esc(f.oct)}`);
    if (f.examFindings) items.push(esc(f.examFindings));
    if (!items.length) return '';
    return `<div class="followup-measurements">${items.map((i) => `<span>${i}</span>`).join('')}</div>`;
  }

  // ── Patient form ────────────────────────────────────────────────────────
  function openPatientForm(existing) {
    const isEdit = !!existing;
    const p = existing || {};
    const selectedGestures = new Set(p.gestures || []);

    const html = `
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Modifier le patient' : 'Nouveau patient'}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-field">
              <label for="f-last">Nom</label>
              <input type="text" id="f-last" value="${esc(p.lastName || '')}" />
            </div>
            <div class="form-field">
              <label for="f-first">Prénom</label>
              <input type="text" id="f-first" value="${esc(p.firstName || '')}" />
            </div>
            <div class="form-field">
              <label for="f-dob">Date de naissance</label>
              <input type="date" id="f-dob" value="${p.dob || ''}" />
            </div>
            <div class="form-field">
              <label for="f-eye">Œil</label>
              <select id="f-eye">
                <option value="">—</option>
                ${EYES.map((e) => `<option value="${e}" ${p.eye === e ? 'selected' : ''}>${e}</option>`).join('')}
              </select>
            </div>
            <div class="form-field">
              <label for="f-date">Date de chirurgie</label>
              <input type="date" id="f-date" value="${p.surgeryDate || ''}" />
            </div>
            <div class="form-field">
              <label for="f-indication">Indication</label>
              <select id="f-indication">
                <option value="">—</option>
                ${INDICATIONS.map((i) => `<option value="${i}" ${p.indication === i ? 'selected' : ''}>${i}</option>`).join('')}
              </select>
              <small>Ou saisir manuellement :</small>
              <input type="text" id="f-indication-custom" value="${(!INDICATIONS.includes(p.indication || '') && p.indication) ? esc(p.indication) : ''}" placeholder="Indication libre..." />
            </div>
          </div>

          <div class="form-field full" style="margin-top:16px">
            <label>Geste(s) chirurgical(aux) — Cataracte</label>
            <div class="chip-picker" id="chips-cat">
              ${GESTURES_CATARACTE.map((g) => `<span class="chip ${selectedGestures.has(g) ? 'selected' : ''}" data-val="${esc(g)}">${esc(g)}</span>`).join('')}
            </div>
          </div>

          <div class="form-field full" style="margin-top:12px">
            <label>Geste(s) chirurgical(aux) — Vitréo-rétinien</label>
            <div class="chip-picker" id="chips-vr">
              ${GESTURES_VR.map((g) => `<span class="chip ${selectedGestures.has(g) ? 'selected' : ''}" data-val="${esc(g)}">${esc(g)}</span>`).join('')}
            </div>
          </div>

          <div class="form-field full" style="margin-top:12px">
            <label for="f-gesture-custom">Geste personnalisé (un par ligne)</label>
            <textarea id="f-gesture-custom" rows="2" placeholder="Ex: Suture cornéenne...">${customGestures(p.gestures || [])}</textarea>
          </div>

          <div class="form-grid" style="margin-top:16px">
            <div class="form-field">
              <label for="f-aide">Aide opératoire</label>
              <input type="text" id="f-aide" value="${esc(p.aide || '')}" placeholder="Nom de l'aide..." />
            </div>
          </div>

          <div class="form-field full" style="margin-top:12px">
            <label for="f-comments">Commentaires</label>
            <textarea id="f-comments" rows="3">${esc(p.comments || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" data-action="cancel">Annuler</button>
          <button class="btn btn-primary" data-action="save">${isEdit ? 'Enregistrer' : 'Créer'}</button>
        </div>
      </div>`;

    showModal(html);

    // chip toggle
    $modal.querySelectorAll('.chip-picker .chip').forEach((chip) =>
      chip.addEventListener('click', () => chip.classList.toggle('selected'))
    );

    // save
    $modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const selected = [];
      $modal.querySelectorAll('.chip-picker .chip.selected').forEach((c) => selected.push(c.dataset.val));
      const customLines = $modal.querySelector('#f-gesture-custom').value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      const gestures = [...selected, ...customLines];

      const indicationSelect = $modal.querySelector('#f-indication').value;
      const indicationCustom = $modal.querySelector('#f-indication-custom').value.trim();
      const indication = indicationCustom || indicationSelect;

      const record = {
        ...(isEdit ? p : {}),
        lastName: $modal.querySelector('#f-last').value.trim(),
        firstName: $modal.querySelector('#f-first').value.trim(),
        dob: $modal.querySelector('#f-dob').value || null,
        eye: $modal.querySelector('#f-eye').value || null,
        surgeryDate: $modal.querySelector('#f-date').value || null,
        indication: indication || null,
        gestures,
        aide: $modal.querySelector('#f-aide').value.trim() || null,
        comments: $modal.querySelector('#f-comments').value.trim() || null,
        updatedAt: new Date().toISOString(),
      };
      if (!isEdit) record.createdAt = new Date().toISOString();

      if (!record.lastName && !record.firstName) {
        toast('Veuillez renseigner au moins le nom ou le prénom.', 'warning');
        return;
      }

      if (isEdit) {
        await db.put(DB_STORES.patients, record);
        toast('Patient mis à jour');
      } else {
        const newId = await db.add(DB_STORES.patients, record);
        selectedPatientId = newId;
        toast('Patient créé');
      }
      closeModal();
      await refreshList();
      if (selectedPatientId) renderDetail(selectedPatientId);
    });
  }

  function customGestures(gestures) {
    const presets = new Set([...GESTURES_CATARACTE, ...GESTURES_VR]);
    return gestures.filter((g) => !presets.has(g)).join('\n');
  }

  // ── Followup form ──────────────────────────────────────────────────────
  function openFollowupForm(patientId, existing) {
    const isEdit = !!existing;
    const f = existing || {};
    const html = `
      <div class="modal">
        <div class="modal-header">
          <h3>${isEdit ? 'Modifier la consultation' : 'Nouvelle consultation'}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-grid">
            <div class="form-field">
              <label for="fu-date">Date</label>
              <input type="date" id="fu-date" value="${f.date || new Date().toISOString().slice(0, 10)}" />
            </div>
            <div class="form-field">
              <label for="fu-av-od">AV OD</label>
              <input type="text" id="fu-av-od" value="${esc(f.avOD || '')}" placeholder="Ex: 10/10" />
            </div>
            <div class="form-field">
              <label for="fu-av-os">AV OS</label>
              <input type="text" id="fu-av-os" value="${esc(f.avOS || '')}" placeholder="Ex: 8/10" />
            </div>
            <div class="form-field">
              <label for="fu-to-od">Tonus OD (mmHg)</label>
              <input type="text" id="fu-to-od" value="${esc(f.tonusOD || '')}" />
            </div>
            <div class="form-field">
              <label for="fu-to-os">Tonus OS (mmHg)</label>
              <input type="text" id="fu-to-os" value="${esc(f.tonusOS || '')}" />
            </div>
            <div class="form-field">
              <label for="fu-oct">OCT</label>
              <input type="text" id="fu-oct" value="${esc(f.oct || '')}" placeholder="Épaisseur, aspect..." />
            </div>
          </div>
          <div class="form-field full" style="margin-top:12px">
            <label for="fu-exam">Examen (LAF, FO...)</label>
            <textarea id="fu-exam" rows="2">${esc(f.examFindings || '')}</textarea>
          </div>
          <div class="form-field full" style="margin-top:12px">
            <label for="fu-notes">Notes / Commentaires</label>
            <textarea id="fu-notes" rows="3">${esc(f.notes || '')}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" data-action="cancel">Annuler</button>
          <button class="btn btn-primary" data-action="save">${isEdit ? 'Enregistrer' : 'Ajouter'}</button>
        </div>
      </div>`;

    showModal(html);

    $modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const record = {
        ...(isEdit ? f : {}),
        patientId,
        date: $modal.querySelector('#fu-date').value || null,
        avOD: $modal.querySelector('#fu-av-od').value.trim() || null,
        avOS: $modal.querySelector('#fu-av-os').value.trim() || null,
        tonusOD: $modal.querySelector('#fu-to-od').value.trim() || null,
        tonusOS: $modal.querySelector('#fu-to-os').value.trim() || null,
        oct: $modal.querySelector('#fu-oct').value.trim() || null,
        examFindings: $modal.querySelector('#fu-exam').value.trim() || null,
        notes: $modal.querySelector('#fu-notes').value.trim() || null,
        createdAt: isEdit ? f.createdAt : new Date().toISOString(),
      };
      if (isEdit) {
        await db.put(DB_STORES.followups, record);
        toast('Consultation mise à jour');
      } else {
        await db.add(DB_STORES.followups, record);
        toast('Consultation ajoutée');
      }
      closeModal();
      renderDetail(patientId);
    });
  }

  // ── Media upload ────────────────────────────────────────────────────────
  function openMediaUpload(patientId) {
    const html = `
      <div class="modal">
        <div class="modal-header">
          <h3>Ajouter des fichiers</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <div class="form-field">
            <label for="mu-files">Images / Vidéos</label>
            <input type="file" id="mu-files" accept="image/*,video/*" multiple />
            <small>Formats acceptés : JPEG, PNG, MP4, MOV, etc. Plusieurs fichiers possibles.</small>
          </div>
          <div class="form-field" style="margin-top:12px">
            <label for="mu-desc">Description (optionnel)</label>
            <input type="text" id="mu-desc" placeholder="Ex: OCT post-op J1" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn" data-action="cancel">Annuler</button>
          <button class="btn btn-primary" data-action="save">Enregistrer</button>
        </div>
      </div>`;

    showModal(html);

    $modal.querySelector('[data-action="save"]').addEventListener('click', async () => {
      const files = $modal.querySelector('#mu-files').files;
      const desc = $modal.querySelector('#mu-desc').value.trim();
      if (!files.length) {
        toast('Veuillez sélectionner au moins un fichier.', 'warning');
        return;
      }
      for (const file of files) {
        await db.add(DB_STORES.media, {
          patientId,
          followupId: null,
          type: file.type.startsWith('video') ? 'video' : 'image',
          blob: file,
          mimeType: file.type,
          filename: file.name,
          description: desc || file.name,
          createdAt: new Date().toISOString(),
        });
      }
      toast(`${files.length} fichier(s) ajouté(s)`);
      closeModal();
      renderDetail(patientId);
    });
  }

  // ── Media viewer ────────────────────────────────────────────────────────
  function openMediaViewer(m, url) {
    const isVideo = m.type === 'video';
    const html = `
      <div class="modal media-viewer">
        <div class="modal-header">
          <h3>${esc(m.description || m.filename || 'Fichier')}</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          ${isVideo
            ? `<video src="${url}" controls autoplay style="max-width:100%;max-height:80vh"></video>`
            : `<img src="${url}" alt="${esc(m.description || '')}" />`}
        </div>
      </div>`;
    showModal(html);
  }

  // ── Delete patient ──────────────────────────────────────────────────────
  async function confirmDeletePatient(p) {
    if (!confirm(`Supprimer définitivement ${p.lastName} ${p.firstName} et tous ses suivis ?`)) return;
    await db.deletePatient(p.id);
    selectedPatientId = null;
    $detail.innerHTML = '<div class="empty-state"><div class="empty-icon">◉</div><h2>Patient supprimé</h2></div>';
    refreshList();
    toast('Patient supprimé');
  }

  // ── Export / Import ─────────────────────────────────────────────────────
  async function exportData() {
    try {
      toast('Export en cours...', 'info');
      const payload = await db.exportAll();
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `suivi-chirurgical-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Export terminé', 'success');
    } catch (e) {
      toast('Erreur lors de l\'export : ' + e.message, 'error');
    }
  }

  async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const replace = confirm(
        'Voulez-vous REMPLACER toutes les données existantes ?\n\n' +
        'OK = Remplacer (tout effacer avant import)\n' +
        'Annuler = Fusionner (ajouter aux données existantes)'
      );
      await db.importAll(payload, { replace });
      selectedPatientId = null;
      await refreshList();
      $detail.innerHTML = '<div class="empty-state"><div class="empty-icon">◉</div><h2>Import réussi</h2><p>Sélectionnez un patient dans la liste.</p></div>';
      toast(`Import réussi (${(payload.patients || []).length} patients)`, 'success');
    } catch (err) {
      toast('Erreur lors de l\'import : ' + err.message, 'error');
    }
  }

  // ── Modal helpers ───────────────────────────────────────────────────────
  function showModal(innerHtml) {
    $modal.innerHTML = innerHtml;
    $modal.classList.remove('hidden');
    $modal.setAttribute('aria-hidden', 'false');
    // close button
    const close = $modal.querySelector('.modal-close');
    if (close) close.addEventListener('click', closeModal);
    const cancel = $modal.querySelector('[data-action="cancel"]');
    if (cancel) cancel.addEventListener('click', closeModal);
    // focus first input
    const first = $modal.querySelector('input,select,textarea');
    if (first) setTimeout(() => first.focus(), 50);
  }

  function closeModal() {
    $modal.classList.add('hidden');
    $modal.setAttribute('aria-hidden', 'true');
    $modal.innerHTML = '';
  }

  // ── Toasts ──────────────────────────────────────────────────────────────
  function toast(msg, type) {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ` ${type}` : '');
    el.textContent = msg;
    container.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }, 3000);
  }

  // ── Utilities ───────────────────────────────────────────────────────────
  function esc(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function formatDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function computeAge(dob) {
    const d = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - d.getFullYear();
    if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) {
      age--;
    }
    return age;
  }

  function formatDelay(surgeryMs, visitMs) {
    const diff = visitMs - surgeryMs;
    const days = Math.round(diff / (24 * 3600 * 1000));
    if (days < 0) return 'Pré-op';
    if (days === 0) return 'J0';
    if (days === 1) return 'J1';
    if (days < 7) return `J${days}`;
    if (days < 30) return `S${Math.round(days / 7)}`;
    if (days < 365) return `M${Math.round(days / 30)}`;
    const years = (days / 365).toFixed(1);
    return `${years} an${years > 1 ? 's' : ''}`;
  }
})();

/* ===========================================================
   projection-core.js – pure linked-state no-change proofs
   =========================================================== */

(function (window) {
  const SNAPSHOT_VERSION = 1;
  const CHANGE_VERSION = 1;
  const PROJECTION_VERSION = 1;
  const SUPPORTED_CAPABILITY_VERSION = 1;
  const STATUS = Object.freeze({
    UNCHANGED: 'unchanged',
    CHANGED: 'changed',
    UNKNOWN: 'unknown'
  });

  const isRecord = value => Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value);

  const isNonEmptyString = value => typeof value === 'string' && value.trim().length > 0;
  const isNonNegativeInteger = value => Number.isInteger(value) && value >= 0;
  const freezeLink = link => Object.freeze({ ...link });

  function makeProjection(status, reason, links = [], evidenceKey = '') {
    return Object.freeze({
      version: PROJECTION_VERSION,
      status,
      reason,
      evidenceKey,
      links: Object.freeze(links.map(freezeLink))
    });
  }

  function unknown(reason, links = []) {
    return makeProjection(STATUS.UNKNOWN, reason, links);
  }

  function normalizeIdList(value) {
    if (!Array.isArray(value)) return null;
    const ids = [];
    const seen = new Set();
    for (const raw of value) {
      if (!['string', 'number'].includes(typeof raw)) return null;
      const id = String(raw).trim();
      if (!id || seen.has(id)) return null;
      seen.add(id);
      ids.push(id);
    }
    return ids;
  }

  function validateVersions(snapshot, change, capabilities) {
    if (!isRecord(snapshot)) return 'snapshot-input-invalid';
    if (snapshot.version !== SNAPSHOT_VERSION) return 'snapshot-version-unsupported';
    if (!isRecord(change)) return 'change-input-invalid';
    if (change.version !== CHANGE_VERSION) return 'change-version-unsupported';
    if (!isRecord(capabilities)) return 'capability-input-invalid';
    if (capabilities.version !== SUPPORTED_CAPABILITY_VERSION) {
      return 'capability-version-unsupported';
    }
    return '';
  }

  function validateCapabilityEvidence(capabilities) {
    if (capabilities.known !== true) return 'capability-evidence-unknown';
    if (capabilities.source !== 'catalog') return 'capability-source-unsupported';
    if (capabilities.item !== true) return 'capability-item-unsupported';
    if (capabilities.quantityMode !== 'stack') return 'capability-quantity-mode-unsupported';
    if (capabilities.topology !== 'leaf') return 'capability-topology-unsupported';
    if (!isNonEmptyString(capabilities.catalogId)) return 'capability-catalog-id-missing';
    if (!Array.isArray(capabilities.stateLinks)) return 'capability-state-links-missing';
    if (!Array.isArray(capabilities.unknownStateLinks)) return 'capability-state-links-incomplete';
    if (capabilities.unknownStateLinks.length > 0) return 'capability-state-link-unknown';
    const declared = capabilities.stateLinks.map(link => String(link || '').trim());
    if (declared.some(link => !link) || new Set(declared).size !== declared.length) {
      return 'capability-state-links-ambiguous';
    }
    return '';
  }

  function validateSnapshotAndChange(snapshot, change, capabilities) {
    const subject = snapshot.subject;
    if (!isRecord(subject)) return 'snapshot-subject-missing';
    if (subject.location !== 'top-level') return 'snapshot-topology-unsupported';
    if (!isNonEmptyString(subject.rowUid)
        || !isNonEmptyString(subject.baseIdentity)
        || !isNonEmptyString(subject.catalogId)) {
      return 'snapshot-identity-missing';
    }
    if (subject.rowReferenceMatches !== 1
        || subject.rowUidMatches !== 1
        || subject.baseIdentityMatches !== 1) {
      return 'snapshot-identity-ambiguous';
    }
    if (!Number.isInteger(subject.rowQuantity) || subject.rowQuantity < 1
        || !Number.isInteger(subject.ownedQuantity)
        || subject.ownedQuantity !== subject.rowQuantity) {
      return 'snapshot-quantity-incomplete';
    }
    if (change.type !== 'top-level-stack-quantity') return 'change-type-unsupported';
    if (change.location !== 'top-level') return 'change-topology-unsupported';
    if (!isNonEmptyString(change.rowUid)
        || !isNonEmptyString(change.baseIdentity)
        || !isNonEmptyString(change.catalogId)) {
      return 'change-identity-missing';
    }
    if (!Number.isInteger(change.delta) || change.delta === 0
        || !isNonNegativeInteger(change.beforeQuantity)
        || !isNonNegativeInteger(change.afterQuantity)
        || change.afterQuantity !== change.beforeQuantity + change.delta
        || !isNonNegativeInteger(change.beforeOwnedQuantity)
        || !isNonNegativeInteger(change.afterOwnedQuantity)
        || change.afterOwnedQuantity !== change.beforeOwnedQuantity + change.delta) {
      return 'change-quantity-invalid';
    }
    if (subject.rowUid !== change.rowUid
        || subject.baseIdentity !== change.baseIdentity
        || subject.catalogId !== change.catalogId
        || subject.catalogId !== String(capabilities.catalogId).trim()) {
      return 'change-identity-stale';
    }
    if (subject.rowQuantity !== change.beforeQuantity
        || subject.ownedQuantity !== change.beforeOwnedQuantity) {
      return 'change-before-state-stale';
    }
    return '';
  }

  function projectCatalogReveal(snapshot, change) {
    const reveal = snapshot.linkedState?.catalogReveal;
    if (!isRecord(reveal) || reveal.complete !== true) {
      return {
        link: 'catalog-reveal-while-owned',
        status: STATUS.UNKNOWN,
        reason: 'catalog-reveal-state-incomplete'
      };
    }
    const ids = normalizeIdList(reveal.ids);
    if (!ids) {
      return {
        link: 'catalog-reveal-while-owned',
        status: STATUS.UNKNOWN,
        reason: 'catalog-reveal-state-invalid'
      };
    }
    const beforeOwned = change.beforeOwnedQuantity > 0;
    const afterOwned = change.afterOwnedQuantity > 0;
    const revealed = ids.includes(change.catalogId);
    if (beforeOwned !== afterOwned) {
      return {
        link: 'catalog-reveal-while-owned',
        status: STATUS.CHANGED,
        reason: 'catalog-reveal-ownership-transition',
        before: Object.freeze({ owned: beforeOwned, revealed }),
        after: Object.freeze({ owned: afterOwned })
      };
    }
    return {
      link: 'catalog-reveal-while-owned',
      status: STATUS.UNCHANGED,
      reason: 'catalog-reveal-ownership-preserved',
      before: Object.freeze({ owned: beforeOwned, revealed }),
      after: Object.freeze({ owned: afterOwned, revealed })
    };
  }

  function projectLink(link, snapshot, change) {
    if (link === 'catalog-reveal-while-owned') {
      return projectCatalogReveal(snapshot, change);
    }
    return {
      link,
      status: STATUS.UNKNOWN,
      reason: `state-link-unsupported:${link}`
    };
  }

  function evaluate({ snapshot, change, capabilities } = {}) {
    const versionFailure = validateVersions(snapshot, change, capabilities);
    if (versionFailure) return unknown(versionFailure);
    const capabilityFailure = validateCapabilityEvidence(capabilities);
    if (capabilityFailure) return unknown(capabilityFailure);
    const inputFailure = validateSnapshotAndChange(snapshot, change, capabilities);
    if (inputFailure) return unknown(inputFailure);

    const links = capabilities.stateLinks.map(link => projectLink(link, snapshot, change));
    const changedLink = links.find(link => link.status === STATUS.CHANGED);
    const unknownLink = links.find(link => link.status === STATUS.UNKNOWN);
    const evidenceKey = JSON.stringify({
      snapshotVersion: snapshot.version,
      changeVersion: change.version,
      capabilityVersion: capabilities.version,
      rowUid: snapshot.subject.rowUid,
      baseIdentity: snapshot.subject.baseIdentity,
      catalogId: snapshot.subject.catalogId,
      rowQuantity: snapshot.subject.rowQuantity,
      ownedQuantity: snapshot.subject.ownedQuantity,
      afterQuantity: change.afterQuantity,
      afterOwnedQuantity: change.afterOwnedQuantity,
      links: links.map(link => ({
        link: link.link,
        status: link.status,
        before: link.before || null,
        after: link.after || null
      }))
    });
    if (changedLink) return makeProjection(STATUS.CHANGED, changedLink.reason, links, evidenceKey);
    if (unknownLink) return makeProjection(STATUS.UNKNOWN, unknownLink.reason, links, evidenceKey);
    return makeProjection(STATUS.UNCHANGED, 'all-declared-links-proven-unchanged', links, evidenceKey);
  }

  window.linkedStateProjectionCore = Object.freeze({
    SNAPSHOT_VERSION,
    CHANGE_VERSION,
    PROJECTION_VERSION,
    STATUS,
    evaluate
  });
})(window);

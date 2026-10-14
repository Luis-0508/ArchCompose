import { useEffect, useRef, useState } from "react";
import { platform, type EngineStatus } from "../platform";
import { IconButton } from "../ui/Button";
import styles from "./App.module.css";
import components from "./thirdPartyComponents.json";

const SOURCE_URL = "https://github.com/Luis-0508/ArchCompose";
const ENGINE_URL = "https://github.com/storytold/photocraft";

/**
 * About ArchCompose: its own licence, where its source is, and the third-party
 * components it includes. Full licence texts ship with the app in
 * THIRD_PARTY_LICENSES.md; attribution for the image engine is shown here verbatim.
 */
export function LicensesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [engine, setEngine] = useState<EngineStatus | null>(null);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
    if (open) platform.engineStatus().then(setEngine, () => setEngine(null));
  }, [open]);

  return (
    <dialog
      ref={dialog}
      className={styles.shortcuts}
      aria-labelledby="licenses-title"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <header className={styles.shortcutsHead}>
        <h2 id="licenses-title">About and licenses</h2>
        <IconButton icon="close" label="Close" onClick={onClose} />
      </header>
      <div className={styles.licenses}>
        <section>
          <h3>ArchCompose {engine?.appVersion ?? ""}</h3>
          <p>
            Free software under the GNU Affero General Public License, version 3 only. The source
            code is at <span className={styles.licenseUrl}>{SOURCE_URL}</span>.
          </p>
        </section>
        {engine?.engineLinked ? (
          <section>
            <h3>Image engine</h3>
            <p>
              Rendering, image decoding and PSD files use crates of PhotoCraft{" "}
              {engine.engineVersion}, commit{" "}
              <span className={styles.licenseUrl}>{engine.engineRevision}</span>, unmodified, from{" "}
              <span className={styles.licenseUrl}>{ENGINE_URL}</span>, used under the MIT License.
            </p>
            <pre className={styles.licenseText}>
              {
                "Copyright (c) 2026 ArtCraft Team and the PhotoCraft contributors.\nLicensed under the MIT License or the Apache License, Version 2.0, at your option."
              }
            </pre>
            <p>
              Its codec crate includes the X11 colour name table, Copyright 1985, 1989, 1998 The
              Open Group, and Copyright (c) 1994, 2008, Oracle and/or its affiliates, under the
              X.Org MIT-style licence.
            </p>
          </section>
        ) : null}
        <section>
          <h3>Third-party components</h3>
          <p>
            Full licence and notice texts are installed with the app in THIRD_PARTY_LICENSES.md and
            THIRD_PARTY_NOTICES.md.
          </p>
          <table className={styles.licenseTable}>
            <thead>
              <tr>
                <th scope="col">Component</th>
                <th scope="col">Version</th>
                <th scope="col">Licence</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c) => (
                <tr key={`${c.name}@${c.version}`}>
                  <td>{c.name}</td>
                  <td className="num">{c.version}</td>
                  <td>{c.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </dialog>
  );
}

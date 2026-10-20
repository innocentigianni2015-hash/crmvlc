import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidad — Vivi Le Canarie",
  description: "Información sobre el tratamiento de los datos enviados a través de la landing de Vivi Le Canarie.",
};

export default function PrivacyPage() {
  return (
    <div className="public-legal">
      <main className="legal-page" data-i18n-lock="es">
        <Link className="legal-back" href="/">← Volver a la landing</Link>
        <p className="eyebrow">Política de privacidad</p>
        <h1>Cómo utilizamos los datos de la solicitud</h1>
        <p>Esta información se refiere a los datos enviados mediante el formulario «Solicitar una llamada» de Vivi Le Canarie.</p>
        <h2>Responsable del tratamiento</h2>
        <p>Canary 360 &amp; Comunication SL · NIF B56378318 · Avenida Las Americas 8, Local 396E, Arona, Santa Cruz de Tenerife.</p>
        <h2>Datos recogidos</h2>
        <p>Recogemos empresa, persona de contacto, teléfono, email, ciudad, isla, servicio solicitado y, en su caso, el mensaje introducido.</p>
        <h2>Finalidad</h2>
        <p>Los datos se utilizan para gestionar la solicitud comercial, asignarla al responsable de la isla indicada y volver a contactar con la persona interesada.</p>
        <h2>Conservación y acceso</h2>
        <p>Los datos solo son accesibles para el personal autorizado y se conservan durante el tiempo necesario para gestionar la solicitud y cumplir las obligaciones aplicables.</p>
        <h2>Derechos</h2>
        <p>Puede solicitar el acceso, la rectificación o la supresión de sus datos escribiendo a <a href="mailto:info@vivilecanarie.com">info@vivilecanarie.com</a>.</p>
        <h2>Propiedad de la plataforma</h2>
        <p>La plataforma CRMVLC.com ha sido creada y desarrollada y es propiedad de Canary 360 &amp; Comunication SL.</p>
      </main>
    </div>
  );
}

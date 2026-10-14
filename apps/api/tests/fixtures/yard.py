"""Synthetic scope for a vehicle-dismantling yard management system (no real client data).

Used by the document rendering tests and the end-to-end flow: it exercises numbered stages, modules,
an hours table with a TOTAL row, a glossary, decision records and resolved grilling questions.
"""

import uuid

from scopeprofit.domain.brief import BriefData
from scopeprofit.domain.branding import Branding

CLIENT_IDEA = (
    "Tenemos un desarmadero y queremos dejar las planillas. Necesitamos registrar cada vehículo que entra "
    "con su chasis y patente, cargar los repuestos que sacamos de cada uno con fotos y ubicación en el depósito, "
    "vender repuestos en el mostrador y saber qué se vendió de cada vehículo para la baja ante el registro."
)

FRANPRZDEV_BRANDING = Branding(
    brand_name="FranPrzDev",
    tagline="Análisis, diseño y desarrollo de software",
    primary_color="#0D1B4C",
    accent_color="#12B55B",
    cover_title_light="ACUERDO DE",
    cover_title_bold="DESARROLLO",
)


def yard_brief(source_message_id: uuid.UUID, *, with_records: bool = True) -> BriefData:
    data: dict[str, object] = {
        "summary": (
            "Aplicación web para digitalizar la operación de un desarmadero: ingreso de vehículos con su "
            "documentación, inventario de repuestos con fotos y ubicación, ventas de mostrador y trazabilidad "
            "de cada pieza hasta la baja del vehículo."
        ),
        "requirements": [
            {
                "id": "RF-01",
                "description": "Registrar vehículos ingresados con chasis (VIN), patente, marca, modelo y año",
                "type": "functional",
                "priority": "must",
                "source": "registrar cada vehículo que entra con su chasis y patente",
                "sourceMessageId": str(source_message_id),
                "systemNote": "Módulo A: Gestión de Vehículos",
            },
            {
                "id": "RF-02",
                "description": "Inventario de repuestos por vehículo con fotos y ubicación en el depósito",
                "type": "functional",
                "priority": "must",
                "source": "cargar los repuestos que sacamos de cada uno con fotos y ubicación en el depósito",
                "sourceMessageId": str(source_message_id),
                "systemNote": "Módulo B: Inventario de Repuestos",
            },
            {
                "id": "RF-03",
                "description": "Ventas de mostrador vinculadas al repuesto y al vehículo de origen",
                "type": "functional",
                "priority": "must",
                "source": "vender repuestos en el mostrador",
                "sourceMessageId": str(source_message_id),
                "systemNote": "Módulo C: Ventas",
            },
        ],
        "questions": [],
        "risks": [
            {
                "id": "R-01",
                "description": "Requisitos legales de baja vehicular no documentados",
                "impact": "Retrabajo en el módulo de trazabilidad",
                "mitigation": "Validar el circuito de baja con el cliente antes del diseño de datos",
                "severity": "yellow",
            }
        ],
        "included": [
            "Módulo A: Gestión de Vehículos",
            "Módulo B: Inventario de Repuestos",
            "Módulo C: Ventas de mostrador",
            "Bajas lógicas para auditoría",
        ],
        "excluded": ["Facturación electrónica", "Tienda online", "Integración con sistemas del registro automotor"],
        "assumptions": ["Un único depósito", "Usuarios internos con roles administrador y vendedor"],
        "acceptanceCriteria": [
            "Cada repuesto vendido muestra su vehículo de origen",
            "Un vehículo dado de baja no admite nuevos repuestos",
        ],
        "estimates": [
            {
                "module": "I. Diseño y planificación",
                "minHours": 30,
                "maxHours": 40,
                "uncertainty": "media",
                "activities": "User flows, wireframes y modelado de datos",
            },
            {
                "module": "II. Gestión de vehículos",
                "minHours": 40,
                "maxHours": 55,
                "uncertainty": "media",
                "activities": "Alta de vehículos, documentación y estados",
            },
            {
                "module": "III. Inventario de repuestos",
                "minHours": 50,
                "maxHours": 70,
                "uncertainty": "alta",
                "activities": "Repuestos con fotos, ubicación y búsqueda",
            },
            {
                "module": "IV. Ventas",
                "minHours": 35,
                "maxHours": 45,
                "uncertainty": "media",
                "activities": "Venta de mostrador y trazabilidad por vehículo",
            },
            {
                "module": "V. Testing y QA",
                "minHours": 25,
                "maxHours": 30,
                "uncertainty": "baja",
                "activities": "Pruebas de integración y validación de permisos por roles",
            },
        ],
        "nextSteps": ["Validar el alcance con el cliente", "Aprobar la versión final del documento"],
    }
    if with_records:
        data["glossary"] = [
            {
                "term": "Vehículo",
                "definition": "Unidad ingresada al desarmadero para su desguace, identificada por chasis y patente.",
                "avoid": ["Auto", "Unidad"],
            },
            {
                "term": "Repuesto",
                "definition": "Pieza recuperada de un Vehículo y disponible para la venta.",
                "avoid": ["Parte", "Pieza suelta"],
            },
            {
                "term": "Baja",
                "definition": "Cierre legal de un Vehículo: no admite nuevos Repuestos.",
            },
        ]
        data["decisions"] = [
            {
                "id": "D-01",
                "title": "Bajas lógicas en todo el sistema",
                "decision": (
                    "Ningún registro se borra físicamente: se marca como dado de baja para conservar la "
                    "trazabilidad legal de cada repuesto vendido."
                ),
                "consideredOptions": ["Borrado físico con historial aparte"],
                "status": "accepted",
            }
        ]
        data["resolvedQuestions"] = [
            {
                "id": "Q-01",
                "question": "¿Un repuesto puede venderse sin vehículo de origen?",
                "answer": "No: todo repuesto nace de un vehículo registrado.",
                "round": 1,
                "acceptedRecommendation": True,
            }
        ]
    return BriefData.model_validate(data)

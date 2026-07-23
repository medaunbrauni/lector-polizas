"""Catálogo completo generado desde datos reales. DO NOT EDIT MANUALLY."""

COMPANIAS_CON_PRIORIDAD = [
    # P01: Quálitas (63.18%)
    {
        "nombre": 'Quálitas',
        "keywords": ['qualitas', 'quálitas', 'cualitas', 'q seguros'],
        "prioridad": 1,
        "porcentaje_docs": 0.631815,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 1, "porcentaje_docs": 0.383061},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 2, "porcentaje_docs": 0.12133},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 3, "porcentaje_docs": 0.098103},
                    {"nombre": 'Autobuses', "keywords": ['autobús', 'autobus', 'bus'], "prioridad": 13, "porcentaje_docs": 0.012767},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 18, "porcentaje_docs": 0.005909},
                    {"nombre": 'Motocicletas', "keywords": ['motocicleta', 'moto'], "prioridad": 22, "porcentaje_docs": 0.003997},
                    {"nombre": 'REMOLQUE', "keywords": ['remolque'], "prioridad": 26, "porcentaje_docs": 0.002911},
                    {"nombre": 'Camiones Flotilla', "keywords": ['camiones flotilla'], "prioridad": 39, "porcentaje_docs": 0.001542},
                    {"nombre": 'Autobuses Flotilla', "keywords": ['autobuses flotilla'], "prioridad": 80, "porcentaje_docs": 0.00053},
                    {"nombre": 'Automoviles Turistas', "keywords": ['turista', 'turismo'], "prioridad": 86, "porcentaje_docs": 0.000456},
                    {"nombre": 'Todo Terreno', "keywords": ['todo terreno'], "prioridad": 169, "porcentaje_docs": 8.6e-05},
                ],
            },
        ],
    },
    # P02: Seguros Afirme (10.05%)
    {
        "nombre": 'Seguros Afirme',
        "keywords": ['afirme', 'seguros afirme'],
        "prioridad": 2,
        "porcentaje_docs": 0.100459,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 4, "porcentaje_docs": 0.080254},
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 8, "porcentaje_docs": 0.018096},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 64, "porcentaje_docs": 0.000715},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 68, "porcentaje_docs": 0.000666},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 96, "porcentaje_docs": 0.00037},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 149, "porcentaje_docs": 0.000136},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 186, "porcentaje_docs": 6.2e-05},
                    {"nombre": 'Rotura de Maquinaria', "keywords": ['rotura maquinaria'], "prioridad": 253, "porcentaje_docs": 1.2e-05},
                    {"nombre": 'Equipo Electronico', "keywords": ['equipo electrónico'], "prioridad": 254, "porcentaje_docs": 1.2e-05},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 255, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 154, "porcentaje_docs": 0.000123},
                ],
            },
        ],
    },
    # P03: Seguros El Potosí (4.47%)
    {
        "nombre": 'Seguros El Potosí',
        "keywords": ['el potosí', 'el potosi', 'potosi'],
        "prioridad": 3,
        "porcentaje_docs": 0.044654,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 7, "porcentaje_docs": 0.018762},
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 12, "porcentaje_docs": 0.013988},
                    {"nombre": 'REMOLQUE', "keywords": ['remolque'], "prioridad": 20, "porcentaje_docs": 0.004885},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 108, "porcentaje_docs": 0.000321},
                    {"nombre": 'Camiones Flotilla', "keywords": ['camiones flotilla'], "prioridad": 135, "porcentaje_docs": 0.000173},
                    {"nombre": 'Autobuses', "keywords": ['autobús', 'autobus', 'bus'], "prioridad": 178, "porcentaje_docs": 7.4e-05},
                    {"nombre": 'R.C. VIAJERO', "keywords": ['viajero'], "prioridad": 261, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 34, "porcentaje_docs": 0.0019},
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 45, "porcentaje_docs": 0.001258},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 60, "porcentaje_docs": 0.000777},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 101, "porcentaje_docs": 0.000358},
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 136, "porcentaje_docs": 0.000173},
                    {"nombre": 'Responsabilidad Civil Profesional', "keywords": ['r.c. profesional', 'responsabilidad profesional'], "prioridad": 212, "porcentaje_docs": 3.7e-05},
                    {"nombre": 'Embarcación', "keywords": ['embarcación'], "prioridad": 262, "porcentaje_docs": 1.2e-05},
                    {"nombre": 'Rotura de Maquinaria', "keywords": ['rotura maquinaria'], "prioridad": 263, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 58, "porcentaje_docs": 0.000937},
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 141, "porcentaje_docs": 0.00016},
                    {"nombre": 'Vida Inversión', "keywords": ['vida inversión'], "prioridad": 229, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Plan Educacion', "keywords": ['plan educación'], "prioridad": 264, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 77, "porcentaje_docs": 0.000543},
                    {"nombre": 'Accidentes Individuales', "keywords": ['accidentes individuales'], "prioridad": 137, "porcentaje_docs": 0.000173},
                    {"nombre": 'Accidentes Colectivo', "keywords": ['accidentes colectivo'], "prioridad": 188, "porcentaje_docs": 6.2e-05},
                ],
            },
        ],
    },
    # P04: GNP Seguros (3.93%)
    {
        "nombre": 'GNP Seguros',
        "keywords": ['gnp seguros', 'grupo nacional provincial', 'g.n.p.', 'gnp'],
        "prioridad": 4,
        "porcentaje_docs": 0.039276,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 6, "porcentaje_docs": 0.01949},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 53, "porcentaje_docs": 0.00111},
                    {"nombre": 'Motocicletas', "keywords": ['motocicleta', 'moto'], "prioridad": 54, "porcentaje_docs": 0.001086},
                    {"nombre": 'Autobuses', "keywords": ['autobús', 'autobus', 'bus'], "prioridad": 104, "porcentaje_docs": 0.000333},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 187, "porcentaje_docs": 6.2e-05},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 198, "porcentaje_docs": 4.9e-05},
                    {"nombre": 'Camiones Flotilla', "keywords": ['camiones flotilla'], "prioridad": 257, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 14, "porcentaje_docs": 0.007981},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 59, "porcentaje_docs": 0.000888},
                    {"nombre": 'Mascota', "keywords": ['mascota'], "prioridad": 125, "porcentaje_docs": 0.00021},
                    {"nombre": 'Gastos Medicos Grupo', "keywords": ['colectivo empresa', 'contratante colectivo'], "prioridad": 171, "porcentaje_docs": 8.6e-05},
                    {"nombre": 'Accidentes Colectivo', "keywords": ['accidentes colectivo'], "prioridad": 177, "porcentaje_docs": 7.4e-05},
                    {"nombre": 'Seguro de Viaje', "keywords": ['seguro de viaje'], "prioridad": 258, "porcentaje_docs": 1.2e-05},
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 259, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 33, "porcentaje_docs": 0.002183},
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 107, "porcentaje_docs": 0.000321},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 37, "porcentaje_docs": 0.001838},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 40, "porcentaje_docs": 0.001443},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 62, "porcentaje_docs": 0.00074},
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 65, "porcentaje_docs": 0.000715},
                    {"nombre": 'Responsabilidad Civil Profesional', "keywords": ['r.c. profesional', 'responsabilidad profesional'], "prioridad": 84, "porcentaje_docs": 0.000481},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 150, "porcentaje_docs": 0.000136},
                    {"nombre": 'Diversos', "keywords": ['diversos'], "prioridad": 260, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P05: HDI Seguros (3.75%)
    {
        "nombre": 'HDI Seguros',
        "keywords": ['hdi seguros', 'hdi'],
        "prioridad": 5,
        "porcentaje_docs": 0.037536,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 5, "porcentaje_docs": 0.026003},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 24, "porcentaje_docs": 0.003294},
                    {"nombre": 'Camiones Flotilla', "keywords": ['camiones flotilla'], "prioridad": 115, "porcentaje_docs": 0.000284},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 129, "porcentaje_docs": 0.000197},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 170, "porcentaje_docs": 8.6e-05},
                    {"nombre": 'Autobuses', "keywords": ['autobús', 'autobus', 'bus'], "prioridad": 197, "porcentaje_docs": 4.9e-05},
                    {"nombre": 'Automoviles Turistas', "keywords": ['turista', 'turismo'], "prioridad": 226, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Motocicletas', "keywords": ['motocicleta', 'moto'], "prioridad": 256, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 27, "porcentaje_docs": 0.002701},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 30, "porcentaje_docs": 0.002516},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 50, "porcentaje_docs": 0.001147},
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 71, "porcentaje_docs": 0.000629},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 100, "porcentaje_docs": 0.000358},
                    {"nombre": 'Responsabilidad Civil Profesional', "keywords": ['r.c. profesional', 'responsabilidad profesional'], "prioridad": 131, "porcentaje_docs": 0.000185},
                    {"nombre": 'Barcos', "keywords": ['barcos', 'nave'], "prioridad": 227, "porcentaje_docs": 2.5e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 228, "porcentaje_docs": 2.5e-05},
                ],
            },
        ],
    },
    # P06: AXA Seguros (2.94%)
    {
        "nombre": 'AXA Seguros',
        "keywords": ['axa seguros', 'axa'],
        "prioridad": 6,
        "porcentaje_docs": 0.029444,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 9, "porcentaje_docs": 0.017232},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 47, "porcentaje_docs": 0.001197},
                    {"nombre": 'Automoviles Turistas', "keywords": ['turista', 'turismo'], "prioridad": 55, "porcentaje_docs": 0.001049},
                    {"nombre": 'REMOLQUE', "keywords": ['remolque'], "prioridad": 199, "porcentaje_docs": 4.9e-05},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 265, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 15, "porcentaje_docs": 0.00708},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 36, "porcentaje_docs": 0.00185},
                    {"nombre": 'Gastos Medicos Grupo', "keywords": ['colectivo empresa', 'contratante colectivo'], "prioridad": 213, "porcentaje_docs": 3.7e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 91, "porcentaje_docs": 0.000407},
                    {"nombre": 'Vida Inversión', "keywords": ['vida inversión'], "prioridad": 266, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 126, "porcentaje_docs": 0.00021},
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 138, "porcentaje_docs": 0.000173},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 179, "porcentaje_docs": 7.4e-05},
                    {"nombre": 'Diversos', "keywords": ['diversos'], "prioridad": 230, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 231, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Responsabilidad Civil Profesional', "keywords": ['r.c. profesional', 'responsabilidad profesional'], "prioridad": 267, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P07: Chubb Seguros (2.25%)
    {
        "nombre": 'Chubb Seguros',
        "keywords": ['chubb'],
        "prioridad": 7,
        "porcentaje_docs": 0.022512,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 11, "porcentaje_docs": 0.015394},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 23, "porcentaje_docs": 0.003972},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 151, "porcentaje_docs": 0.000136},
                    {"nombre": 'Motocicletas', "keywords": ['motocicleta', 'moto'], "prioridad": 155, "porcentaje_docs": 0.000123},
                    {"nombre": 'REMOLQUE', "keywords": ['remolque'], "prioridad": 233, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 268, "porcentaje_docs": 1.2e-05},
                    {"nombre": 'Automoviles Turistas', "keywords": ['turista', 'turismo'], "prioridad": 269, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 70, "porcentaje_docs": 0.000641},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 85, "porcentaje_docs": 0.000469},
                    {"nombre": 'Responsabilidad Civil Profesional', "keywords": ['r.c. profesional', 'responsabilidad profesional'], "prioridad": 102, "porcentaje_docs": 0.000358},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 105, "porcentaje_docs": 0.000333},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 109, "porcentaje_docs": 0.000321},
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 112, "porcentaje_docs": 0.000296},
                    {"nombre": 'Obra Civil', "keywords": ['obra civil'], "prioridad": 216, "porcentaje_docs": 3.7e-05},
                    {"nombre": 'Embarcación', "keywords": ['embarcación'], "prioridad": 270, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Accidentes Individuales', "keywords": ['accidentes individuales'], "prioridad": 145, "porcentaje_docs": 0.000148},
                    {"nombre": 'Seguro de Viaje', "keywords": ['seguro de viaje'], "prioridad": 156, "porcentaje_docs": 0.000123},
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 202, "porcentaje_docs": 4.9e-05},
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 203, "porcentaje_docs": 4.9e-05},
                ],
            },
        ],
    },
    # P08: Zurich (2.14%)
    {
        "nombre": 'Zurich',
        "keywords": ['zurich', 'zürich'],
        "prioridad": 8,
        "porcentaje_docs": 0.021352,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 10, "porcentaje_docs": 0.015962},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 93, "porcentaje_docs": 0.000395},
                    {"nombre": 'Autobuses', "keywords": ['autobús', 'autobus', 'bus'], "prioridad": 214, "porcentaje_docs": 3.7e-05},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 232, "porcentaje_docs": 2.5e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 31, "porcentaje_docs": 0.002455},
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 72, "porcentaje_docs": 0.000617},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 78, "porcentaje_docs": 0.000543},
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 94, "porcentaje_docs": 0.000395},
                    {"nombre": 'Obra Civil', "keywords": ['obra civil'], "prioridad": 189, "porcentaje_docs": 6.2e-05},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 200, "porcentaje_docs": 4.9e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Seguro de Viaje', "keywords": ['seguro de viaje'], "prioridad": 87, "porcentaje_docs": 0.000444},
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 116, "porcentaje_docs": 0.000284},
                    {"nombre": 'Gastos Medicos Grupo', "keywords": ['colectivo empresa', 'contratante colectivo'], "prioridad": 215, "porcentaje_docs": 3.7e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 201, "porcentaje_docs": 4.9e-05},
                ],
            },
        ],
    },
    # P09: Banorte Seguros (1.25%)
    {
        "nombre": 'Banorte Seguros',
        "keywords": ['banorte seguros', 'banorte generali', 'banorte'],
        "prioridad": 9,
        "porcentaje_docs": 0.012471,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 19, "porcentaje_docs": 0.005477},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 29, "porcentaje_docs": 0.002553},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 56, "porcentaje_docs": 0.001036},
                    {"nombre": 'Motocicletas', "keywords": ['motocicleta', 'moto'], "prioridad": 82, "porcentaje_docs": 0.000493},
                    {"nombre": 'Autobuses', "keywords": ['autobús', 'autobus', 'bus'], "prioridad": 110, "porcentaje_docs": 0.000321},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 152, "porcentaje_docs": 0.000136},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 49, "porcentaje_docs": 0.001197},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 66, "porcentaje_docs": 0.000715},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 122, "porcentaje_docs": 0.000234},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 172, "porcentaje_docs": 8.6e-05},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 273, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 127, "porcentaje_docs": 0.00021},
                ],
            },
        ],
    },
    # P10: ANA Seguros (1.00%)
    {
        "nombre": 'ANA Seguros',
        "keywords": ['ana seguros', 'ana compañía'],
        "prioridad": 10,
        "porcentaje_docs": 0.010004,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 16, "porcentaje_docs": 0.006994},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 48, "porcentaje_docs": 0.001197},
                    {"nombre": 'Autobuses', "keywords": ['autobús', 'autobus', 'bus'], "prioridad": 88, "porcentaje_docs": 0.000432},
                    {"nombre": 'Motocicletas', "keywords": ['motocicleta', 'moto'], "prioridad": 92, "porcentaje_docs": 0.000407},
                    {"nombre": 'Flotilla de Vehiculos', "keywords": ['flotilla', 'flota vehicular'], "prioridad": 95, "porcentaje_docs": 0.000395},
                    {"nombre": 'VehiculosESPECIAL', "keywords": ['vehículo especial'], "prioridad": 113, "porcentaje_docs": 0.000296},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 139, "porcentaje_docs": 0.000173},
                    {"nombre": 'Camiones Flotilla', "keywords": ['camiones flotilla'], "prioridad": 180, "porcentaje_docs": 7.4e-05},
                    {"nombre": 'Automoviles Turistas', "keywords": ['turista', 'turismo'], "prioridad": 217, "porcentaje_docs": 3.7e-05},
                ],
            },
        ],
    },
    # P11: Mapfre México (0.80%)
    {
        "nombre": 'Mapfre México',
        "keywords": ['mapfre'],
        "prioridad": 11,
        "porcentaje_docs": 0.00803,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 21, "porcentaje_docs": 0.004305},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 181, "porcentaje_docs": 7.4e-05},
                    {"nombre": 'Motocicletas', "keywords": ['motocicleta', 'moto'], "prioridad": 204, "porcentaje_docs": 4.9e-05},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 274, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 38, "porcentaje_docs": 0.001591},
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 83, "porcentaje_docs": 0.000493},
                    {"nombre": 'Seguro de Viaje', "keywords": ['seguro de viaje'], "prioridad": 103, "porcentaje_docs": 0.000345},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 123, "porcentaje_docs": 0.000222},
                    {"nombre": 'Accidentes Individuales', "keywords": ['accidentes individuales'], "prioridad": 132, "porcentaje_docs": 0.000185},
                    {"nombre": 'Gastos Medicos Grupo', "keywords": ['colectivo empresa', 'contratante colectivo'], "prioridad": 182, "porcentaje_docs": 7.4e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 120, "porcentaje_docs": 0.000247},
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 147, "porcentaje_docs": 0.000148},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 162, "porcentaje_docs": 0.000111},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 275, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Gastos Funerarios', "keywords": ['funerario'], "prioridad": 183, "porcentaje_docs": 7.4e-05},
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 190, "porcentaje_docs": 6.2e-05},
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 235, "porcentaje_docs": 2.5e-05},
                ],
            },
        ],
    },
    # P12: Seguros BX+ (0.75%)
    {
        "nombre": 'Seguros BX+',
        "keywords": ['bx+', 'seguros bx'],
        "prioridad": 12,
        "porcentaje_docs": 0.007475,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 17, "porcentaje_docs": 0.006871},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 114, "porcentaje_docs": 0.000296},
                    {"nombre": 'Gastos Medicos Grupo', "keywords": ['colectivo empresa', 'contratante colectivo'], "prioridad": 234, "porcentaje_docs": 2.5e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 146, "porcentaje_docs": 0.000148},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 271, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 161, "porcentaje_docs": 0.000111},
                ],
            },
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 272, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P13: Seguros Atlas (0.59%)
    {
        "nombre": 'Seguros Atlas',
        "keywords": ['seguros atlas'],
        "prioridad": 13,
        "porcentaje_docs": 0.005872,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Seguro de Viaje', "keywords": ['seguro de viaje'], "prioridad": 28, "porcentaje_docs": 0.00264},
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 42, "porcentaje_docs": 0.001357},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 236, "porcentaje_docs": 2.5e-05},
                ],
            },
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 44, "porcentaje_docs": 0.001295},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 163, "porcentaje_docs": 0.000111},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 97, "porcentaje_docs": 0.00037},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 237, "porcentaje_docs": 2.5e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 238, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 239, "porcentaje_docs": 2.5e-05},
                ],
            },
        ],
    },
    # P14: HIR Seguros (0.39%)
    {
        "nombre": 'HIR Seguros',
        "keywords": ['hir seguros', 'hir'],
        "prioridad": 14,
        "porcentaje_docs": 0.003935,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 25, "porcentaje_docs": 0.002973},
                    {"nombre": 'Accidentes Colectivo', "keywords": ['accidentes colectivo'], "prioridad": 61, "porcentaje_docs": 0.000752},
                    {"nombre": 'Accidentes Individuales', "keywords": ['accidentes individuales'], "prioridad": 191, "porcentaje_docs": 6.2e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 153, "porcentaje_docs": 0.000136},
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 276, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P15: Sura (0.35%)
    {
        "nombre": 'Sura',
        "keywords": ['sura'],
        "prioridad": 15,
        "porcentaje_docs": 0.003516,
        "ramos": [
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 46, "porcentaje_docs": 0.001209},
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 89, "porcentaje_docs": 0.000432},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 140, "porcentaje_docs": 0.000173},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 206, "porcentaje_docs": 4.9e-05},
                ],
            },
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 75, "porcentaje_docs": 0.000567},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 279, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 79, "porcentaje_docs": 0.000543},
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 99, "porcentaje_docs": 0.00037},
                    {"nombre": 'Accidentes Colectivo', "keywords": ['accidentes colectivo'], "prioridad": 207, "porcentaje_docs": 4.9e-05},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 242, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Accidentes Individuales', "keywords": ['accidentes individuales'], "prioridad": 280, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 208, "porcentaje_docs": 4.9e-05},
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 243, "porcentaje_docs": 2.5e-05},
                ],
            },
        ],
    },
    # P16: Thona Seguros (0.29%)
    {
        "nombre": 'Thona Seguros',
        "keywords": ['thona'],
        "prioridad": 16,
        "porcentaje_docs": 0.002948,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Accidentes Colectivo', "keywords": ['accidentes colectivo'], "prioridad": 35, "porcentaje_docs": 0.001863},
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 81, "porcentaje_docs": 0.000518},
                    {"nombre": 'Accidentes Individuales', "keywords": ['accidentes individuales'], "prioridad": 133, "porcentaje_docs": 0.000185},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 119, "porcentaje_docs": 0.000259},
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 158, "porcentaje_docs": 0.000123},
                ],
            },
        ],
    },
    # P17: Liberty Fianzas (0.25%)
    {
        "nombre": 'Liberty Fianzas',
        "keywords": ['liberty fianzas', 'liberty'],
        "prioridad": 17,
        "porcentaje_docs": 0.002479,
        "ramos": [
            {
                "nombre": 'Fianzas',
                "keywords": ['fianza', 'garantía', 'cumplimiento', 'fidelidad'],
                "subramos": [
                    {"nombre": 'Administrativa', "keywords": ['fianza administrativa'], "prioridad": 32, "porcentaje_docs": 0.002307},
                    {"nombre": 'Crédito', "keywords": ['crédito'], "prioridad": 157, "porcentaje_docs": 0.000123},
                    {"nombre": 'Fianza de Cumplimiento', "keywords": ['cumplimiento'], "prioridad": 205, "porcentaje_docs": 4.9e-05},
                ],
            },
        ],
    },
    # P18: Allianz México (0.24%)
    {
        "nombre": 'Allianz México',
        "keywords": ['allianz'],
        "prioridad": 18,
        "porcentaje_docs": 0.00243,
        "ramos": [
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 43, "porcentaje_docs": 0.001308},
                    {"nombre": 'Vida Inversión', "keywords": ['vida inversión'], "prioridad": 106, "porcentaje_docs": 0.000333},
                    {"nombre": 'Educacionales', "keywords": ['educacional'], "prioridad": 219, "porcentaje_docs": 3.7e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 98, "porcentaje_docs": 0.00037},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 193, "porcentaje_docs": 6.2e-05},
                    {"nombre": 'Gastos Medicos Grupo', "keywords": ['colectivo empresa', 'contratante colectivo'], "prioridad": 240, "porcentaje_docs": 2.5e-05},
                ],
            },
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 117, "porcentaje_docs": 0.000271},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 241, "porcentaje_docs": 2.5e-05},
                ],
            },
        ],
    },
    # P19: Primero Seguros (0.17%)
    {
        "nombre": 'Primero Seguros',
        "keywords": ['primero seguros'],
        "prioridad": 19,
        "porcentaje_docs": 0.00169,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 41, "porcentaje_docs": 0.001382},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 134, "porcentaje_docs": 0.000185},
                    {"nombre": 'Bicicleta', "keywords": ['bicicleta'], "prioridad": 277, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 192, "porcentaje_docs": 6.2e-05},
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 218, "porcentaje_docs": 3.7e-05},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 278, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P20: Plan Seguro (0.13%)
    {
        "nombre": 'Plan Seguro',
        "keywords": ['plan seguro'],
        "prioridad": 20,
        "porcentaje_docs": 0.001345,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 51, "porcentaje_docs": 0.001135},
                    {"nombre": 'SALUD', "keywords": ['salud'], "prioridad": 130, "porcentaje_docs": 0.000197},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 281, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P21: General de Seguros (0.11%)
    {
        "nombre": 'General de Seguros',
        "keywords": ['general de seguros'],
        "prioridad": 21,
        "porcentaje_docs": 0.00111,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 74, "porcentaje_docs": 0.00058},
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 209, "porcentaje_docs": 4.9e-05},
                ],
            },
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Individual', "keywords": ['vida individual'], "prioridad": 142, "porcentaje_docs": 0.00016},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'SALUD', "keywords": ['salud'], "prioridad": 165, "porcentaje_docs": 9.9e-05},
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 210, "porcentaje_docs": 4.9e-05},
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 221, "porcentaje_docs": 3.7e-05},
                    {"nombre": 'Accidentes Colectivo', "keywords": ['accidentes colectivo'], "prioridad": 245, "porcentaje_docs": 2.5e-05},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 175, "porcentaje_docs": 8.6e-05},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 246, "porcentaje_docs": 2.5e-05},
                ],
            },
        ],
    },
    # P22: La Latinoamericana (0.11%)
    {
        "nombre": 'La Latinoamericana',
        "keywords": ['latinoamericana'],
        "prioridad": 22,
        "porcentaje_docs": 0.001086,
        "ramos": [
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 67, "porcentaje_docs": 0.000715},
                    {"nombre": 'Servicio Público', "keywords": ['servicio público', 'servicio publico', 's.p.', 'transporte público'], "prioridad": 118, "porcentaje_docs": 0.000271},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Accidentes Escolares', "keywords": ['escolar', 'accidentes escolares'], "prioridad": 173, "porcentaje_docs": 8.6e-05},
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 283, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P23: Prevem (0.10%)
    {
        "nombre": 'Prevem',
        "keywords": ['prevem'],
        "prioridad": 23,
        "porcentaje_docs": 0.001036,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 57, "porcentaje_docs": 0.001024},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 282, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P24: GMX Seguros (0.09%)
    {
        "nombre": 'GMX Seguros',
        "keywords": ['gmx seguros', 'gmx'],
        "prioridad": 24,
        "porcentaje_docs": 0.00095,
        "ramos": [
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 69, "porcentaje_docs": 0.000666},
                    {"nombre": 'Responsabilidad Civil Profesional', "keywords": ['r.c. profesional', 'responsabilidad profesional'], "prioridad": 159, "porcentaje_docs": 0.000123},
                    {"nombre": 'Equipo de Contratistas', "keywords": ['contratista'], "prioridad": 174, "porcentaje_docs": 8.6e-05},
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 220, "porcentaje_docs": 3.7e-05},
                    {"nombre": 'Transportes', "keywords": ['transporte de carga', 'mercancías'], "prioridad": 284, "porcentaje_docs": 1.2e-05},
                ],
            },
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 244, "porcentaje_docs": 2.5e-05},
                ],
            },
        ],
    },
    # P25: Avla Seguros (0.07%)
    {
        "nombre": 'Avla Seguros',
        "keywords": ['avla'],
        "prioridad": 25,
        "porcentaje_docs": 0.00074,
        "ramos": [
            {
                "nombre": 'Fianzas',
                "keywords": ['fianza', 'garantía', 'cumplimiento', 'fidelidad'],
                "subramos": [
                    {"nombre": 'Administrativa', "keywords": ['fianza administrativa'], "prioridad": 63, "porcentaje_docs": 0.00074},
                ],
            },
        ],
    },
    # P26: Bupa México (0.07%)
    {
        "nombre": 'Bupa México',
        "keywords": ['bupa'],
        "prioridad": 26,
        "porcentaje_docs": 0.000691,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 76, "porcentaje_docs": 0.000567},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 160, "porcentaje_docs": 0.000123},
                ],
            },
        ],
    },
    # P27: MetLife (0.06%)
    {
        "nombre": 'MetLife',
        "keywords": ['metlife'],
        "prioridad": 27,
        "porcentaje_docs": 0.000617,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 73, "porcentaje_docs": 0.000604},
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 285, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P28: Seguros Inbursa (0.05%)
    {
        "nombre": 'Seguros Inbursa',
        "keywords": ['inbursa'],
        "prioridad": 28,
        "porcentaje_docs": 0.000481,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 124, "porcentaje_docs": 0.000222},
                ],
            },
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 164, "porcentaje_docs": 0.000111},
                    {"nombre": 'Responsabilidad Civil', "keywords": ['responsabilidad civil', 'r.c. general'], "prioridad": 222, "porcentaje_docs": 3.7e-05},
                ],
            },
            {
                "nombre": 'Vehículos',
                "keywords": ['automóvil', 'vehículo', 'vehiculo', 'auto', 'flotilla', 'placas'],
                "subramos": [
                    {"nombre": 'Camiones', "keywords": ['camión', 'camion', 'pesado', 'carga'], "prioridad": 194, "porcentaje_docs": 6.2e-05},
                    {"nombre": 'REMOLQUE', "keywords": ['remolque'], "prioridad": 223, "porcentaje_docs": 3.7e-05},
                    {"nombre": 'Automóviles', "keywords": ['particular', 'automóvil', 'automovil', 'uso particular'], "prioridad": 289, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P29: Quálitas Salud (0.05%)
    {
        "nombre": 'Quálitas Salud',
        "keywords": ['qualitas salud'],
        "prioridad": 29,
        "porcentaje_docs": 0.000456,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 144, "porcentaje_docs": 0.00016},
                    {"nombre": 'Gastos Medicos Grupo', "keywords": ['colectivo empresa', 'contratante colectivo'], "prioridad": 166, "porcentaje_docs": 9.9e-05},
                    {"nombre": 'Accidentes Colectivo', "keywords": ['accidentes colectivo'], "prioridad": 195, "porcentaje_docs": 6.2e-05},
                    {"nombre": 'SALUD', "keywords": ['salud'], "prioridad": 211, "porcentaje_docs": 4.9e-05},
                ],
            },
        ],
    },
    # P30: Sofimex (0.05%)
    {
        "nombre": 'Sofimex',
        "keywords": ['sofimex'],
        "prioridad": 30,
        "porcentaje_docs": 0.000456,
        "ramos": [
            {
                "nombre": 'Fianzas',
                "keywords": ['fianza', 'garantía', 'cumplimiento', 'fidelidad'],
                "subramos": [
                    {"nombre": 'Administrativa', "keywords": ['fianza administrativa'], "prioridad": 90, "porcentaje_docs": 0.000432},
                    {"nombre": 'Fidelidad', "keywords": ['fidelidad'], "prioridad": 286, "porcentaje_docs": 1.2e-05},
                    {"nombre": 'Fianza de Cumplimiento', "keywords": ['cumplimiento'], "prioridad": 287, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P31: Fianzas Dorama (0.04%)
    {
        "nombre": 'Fianzas Dorama',
        "keywords": ['dorama'],
        "prioridad": 31,
        "porcentaje_docs": 0.000407,
        "ramos": [
            {
                "nombre": 'Fianzas',
                "keywords": ['fianza', 'garantía', 'cumplimiento', 'fidelidad'],
                "subramos": [
                    {"nombre": 'Fianza de Cumplimiento', "keywords": ['cumplimiento'], "prioridad": 111, "porcentaje_docs": 0.000321},
                    {"nombre": 'Fianza Calidad', "keywords": ['calidad'], "prioridad": 184, "porcentaje_docs": 7.4e-05},
                    {"nombre": 'Anticipo de Obra', "keywords": ['anticipo de obra'], "prioridad": 288, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P32: Prosalud Mutuus (0.02%)
    {
        "nombre": 'Prosalud Mutuus',
        "keywords": ['prosalud', 'mutuus'],
        "prioridad": 32,
        "porcentaje_docs": 0.000247,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 121, "porcentaje_docs": 0.000247},
                ],
            },
        ],
    },
    # P33: Berkley Fianzas (0.02%)
    {
        "nombre": 'Berkley Fianzas',
        "keywords": ['berkley'],
        "prioridad": 33,
        "porcentaje_docs": 0.000222,
        "ramos": [
            {
                "nombre": 'Fianzas',
                "keywords": ['fianza', 'garantía', 'cumplimiento', 'fidelidad'],
                "subramos": [
                    {"nombre": 'Administrativa', "keywords": ['fianza administrativa'], "prioridad": 143, "porcentaje_docs": 0.00016},
                    {"nombre": 'Fianza de Cumplimiento', "keywords": ['cumplimiento'], "prioridad": 247, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Fianza Calidad', "keywords": ['calidad'], "prioridad": 248, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Fianza de Anticipo', "keywords": ['anticipo'], "prioridad": 290, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P34: Fianzas Atlas (0.02%)
    {
        "nombre": 'Fianzas Atlas',
        "keywords": ['fianzas atlas'],
        "prioridad": 34,
        "porcentaje_docs": 0.00021,
        "ramos": [
            {
                "nombre": 'Fianzas',
                "keywords": ['fianza', 'garantía', 'cumplimiento', 'fidelidad'],
                "subramos": [
                    {"nombre": 'Administrativa', "keywords": ['fianza administrativa'], "prioridad": 128, "porcentaje_docs": 0.00021},
                ],
            },
        ],
    },
    # P35: Dentegra (0.02%)
    {
        "nombre": 'Dentegra',
        "keywords": ['dentegra'],
        "prioridad": 35,
        "porcentaje_docs": 0.000173,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Seguro Dental Colectivo', "keywords": ['dental colectivo'], "prioridad": 167, "porcentaje_docs": 9.9e-05},
                    {"nombre": 'Seguro Dental Individual', "keywords": ['dental individual'], "prioridad": 185, "porcentaje_docs": 7.4e-05},
                ],
            },
        ],
    },
    # P36: Tokyo Marine (0.02%)
    {
        "nombre": 'Tokyo Marine',
        "keywords": ['tokyo marine'],
        "prioridad": 36,
        "porcentaje_docs": 0.00016,
        "ramos": [
            {
                "nombre": 'Daños',
                "keywords": ['responsabilidad civil', 'r.c.', 'daños', 'empresarial', 'incendio'],
                "subramos": [
                    {"nombre": 'Bienes Familiares', "keywords": ['hogar', 'casa habitación', 'bienes familiares'], "prioridad": 168, "porcentaje_docs": 9.9e-05},
                    {"nombre": 'Empresariales', "keywords": ['empresarial', 'negocio', 'comercial'], "prioridad": 196, "porcentaje_docs": 6.2e-05},
                ],
            },
        ],
    },
    # P37: Aserta Fianzas (0.01%)
    {
        "nombre": 'Aserta Fianzas',
        "keywords": ['aserta'],
        "prioridad": 37,
        "porcentaje_docs": 0.000148,
        "ramos": [
            {
                "nombre": 'Fianzas',
                "keywords": ['fianza', 'garantía', 'cumplimiento', 'fidelidad'],
                "subramos": [
                    {"nombre": 'Administrativa', "keywords": ['fianza administrativa'], "prioridad": 148, "porcentaje_docs": 0.000148},
                ],
            },
        ],
    },
    # P38: Seguros Centauro (0.01%)
    {
        "nombre": 'Seguros Centauro',
        "keywords": ['centauro'],
        "prioridad": 38,
        "porcentaje_docs": 6.2e-05,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Seguro Dental Familiar', "keywords": ['dental familiar'], "prioridad": 249, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Seguro Dental Individual', "keywords": ['dental individual'], "prioridad": 250, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Seguro Visión Colectivo', "keywords": ['visión colectivo'], "prioridad": 291, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
    # P39: Seguros Monterrey (0.00%)
    {
        "nombre": 'Seguros Monterrey',
        "keywords": ['seguros monterrey', 'monterrey ny life'],
        "prioridad": 39,
        "porcentaje_docs": 4.9e-05,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Gastos Medicos Familiar', "keywords": ['gastos médicos familiar', 'familiar'], "prioridad": 251, "porcentaje_docs": 2.5e-05},
                    {"nombre": 'Gastos Medicos', "keywords": ['gastos médicos mayores', 'gmm', 'individual médico'], "prioridad": 252, "porcentaje_docs": 2.5e-05},
                ],
            },
        ],
    },
    # P40: AIG Seguros (0.00%)
    {
        "nombre": 'AIG Seguros',
        "keywords": ['aig', 'interamericana'],
        "prioridad": 40,
        "porcentaje_docs": 3.7e-05,
        "ramos": [
            {
                "nombre": 'Accidentes y Enfermedades',
                "keywords": ['gastos médicos', 'gastos medicos', 'accidente', 'enfermed', 'hospitalización'],
                "subramos": [
                    {"nombre": 'Accidentes Colectivo', "keywords": ['accidentes colectivo'], "prioridad": 224, "porcentaje_docs": 3.7e-05},
                ],
            },
        ],
    },
    # P41: Seguros Argos (0.00%)
    {
        "nombre": 'Seguros Argos',
        "keywords": ['argos seguros'],
        "prioridad": 41,
        "porcentaje_docs": 3.7e-05,
        "ramos": [
            {
                "nombre": 'Vida',
                "keywords": ['seguro de vida', 'vida', 'fallecimiento', 'beneficiario'],
                "subramos": [
                    {"nombre": 'Vida Grupo', "keywords": ['vida grupo'], "prioridad": 225, "porcentaje_docs": 3.7e-05},
                ],
            },
        ],
    },
    # P42: Tokyo Marine Fianzas (0.00%)
    {
        "nombre": 'Tokyo Marine Fianzas',
        "keywords": ['tokyo marine fianzas'],
        "prioridad": 42,
        "porcentaje_docs": 1.2e-05,
        "ramos": [
            {
                "nombre": 'Fianzas',
                "keywords": ['fianza', 'garantía', 'cumplimiento', 'fidelidad'],
                "subramos": [
                    {"nombre": 'Administrativa', "keywords": ['fianza administrativa'], "prioridad": 292, "porcentaje_docs": 1.2e-05},
                ],
            },
        ],
    },
]
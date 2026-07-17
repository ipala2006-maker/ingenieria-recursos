const DATA = {
  carreras: [
    {
      slug: "ingenieria",
      title: "Ingeniería",
      description: "Carrera de ingeniería.",
      materias: [
        {
          slug: "analisis-matematico-1",
          title: "Análisis Matemático I",
          description: "Límites, derivadas e integrales.",
          temas: [
            {
              slug: "limites",
              title: "Límites",
              meta: "Base para cálculo",
              videos: [
                { url: "https://www.youtube.com/watch?v=o2UTk8bsLS0" },
                { url: "https://www.youtube.com/watch?v=fu03ekT_D4g" }
              ],
              herramientas: [
                {
                  title: "GeoGebra - Límites y continuidad",
                  url: "https://www.geogebra.org/m/JK3Dq2ZN",
                  type: "Interactivo"
                },
                {
                  title: "Symbolab - Calculadora de límites paso a paso",
                  url: "https://es.symbolab.com/solver/limit-calculator",
                  type: "Calculadora"
                },
                {
                  title: "Proyecto Descartes - Cálculo diferencial interactivo",
                  url: "https://proyectodescartes.org/iCartesiLibri/materiales_didacticos/Libro_Calculo_Diferencial-JS/index.html",
                  type: "Interactivo"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Cálculo 1 - El límite de una función",
                  url: "https://openstax.org/books/c%C3%A1lculo-volumen-1/pages/2-2-el-limite-de-una-funcion"
                },
                {
                  title: "Khan Academy - Límites y continuidad",
                  url: "https://es.khanacademy.org/math/differential-calculus/dc-limits"
                },
                {
                  title: "Proyecto Descartes - Cálculo diferencial",
                  url: "https://proyectodescartes.org/iCartesiLibri/PDF/C%C3%A1lculo_Diferencial_e_Integral-1.pdf"
                }
              ]
            },
            {
              slug: "continuidad",
              title: "Continuidad",
              meta: "Propiedades",
              videos: [
                { url: "https://www.youtube.com/watch?v=_FIE0_prPYE" },
                { url: "https://www.youtube.com/watch?v=ZEAPl6VN4JU" }
              ],
              herramientas: [
                {
                  title: "Desmos - Graficadora para explorar discontinuidades",
                  url: "https://www.desmos.com/calculator?lang=es",
                  type: "Graficadora"
                },
                {
                  title: "GeoGebra - Límites y continuidad",
                  url: "https://www.geogebra.org/m/JK3Dq2ZN",
                  type: "Interactivo"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Cálculo 1 - Continuidad",
                  url: "https://openstax.org/books/c%C3%A1lculo-volumen-1/pages/2-4-continuidad"
                },
                {
                  title: "Khan Academy - Continuidad",
                  url: "https://es.khanacademy.org/math/calculus-all-old/limits-and-continuity-calc"
                }
              ]
            },
            {
              slug: "derivadas",
              title: "Derivadas",
              meta: "Tasa de cambio",
              videos: [
                { url: "https://www.youtube.com/watch?v=pMYdSjgzrys" },
                { url: "https://www.youtube.com/watch?v=uK4-s0ojHFg" }
              ],
              herramientas: [
                {
                  title: "Proyecto Descartes - Cálculo diferencial interactivo",
                  url: "https://proyectodescartes.org/iCartesiLibri/materiales_didacticos/Calculo_Diferencial_e_Integral_I/index.html",
                  type: "Interactivo"
                },
                {
                  title: "Desmos - Graficadora con derivadas",
                  url: "https://www.desmos.com/calculator?lang=es",
                  type: "Graficadora"
                },
                {
                  title: "Symbolab - Calculadora de derivadas",
                  url: "https://es.symbolab.com/solver/derivative-calculator",
                  type: "Calculadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Cálculo 1 - Definir la derivada",
                  url: "https://openstax.org/books/c%C3%A1lculo-volumen-1/pages/3-1-definir-la-derivada"
                },
                {
                  title: "Khan Academy - Derivadas",
                  url: "https://es.khanacademy.org/math/differential-calculus/dc-diff-intro"
                }
              ]
            },
            {
              slug: "integrales",
              title: "Integrales",
              meta: "Acumulación",
              videos: [
                { url: "https://www.youtube.com/watch?v=d7Y9Om4KCUM" },
                { url: "https://www.youtube.com/watch?v=TocqVkBzDrA" },
                { url: "https://www.youtube.com/watch?v=Mxjyb1yII-8" }
              ],
              herramientas: [
                {
                  title: "Proyecto Descartes - Cálculo integral interactivo",
                  url: "https://proyectodescartes.org/iCartesiLibri/materiales_didacticos/Calculo_Diferencial_e_Integral_II/index.html",
                  type: "Interactivo"
                },
                {
                  title: "Symbolab - Calculadora de integrales paso a paso",
                  url: "https://es.symbolab.com/solver/integral-calculator",
                  type: "Calculadora"
                },
                {
                  title: "Desmos - Graficadora para áreas bajo la curva",
                  url: "https://www.desmos.com/calculator?lang=es",
                  type: "Graficadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Cálculo 1 - La integral definida",
                  url: "https://openstax.org/books/c%C3%A1lculo-volumen-1/pages/5-2-la-integral-definida"
                },
                {
                  title: "OpenStax Cálculo 1 - Antiderivadas",
                  url: "https://openstax.org/books/c%C3%A1lculo-volumen-1/pages/4-10-antiderivadas"
                },
                {
                  title: "Khan Academy - Integrales",
                  url: "https://es.khanacademy.org/math/integral-calculus/ic-integration"
                }
              ]
            },
            {
              slug: "sucesiones",
              title: "Sucesiones",
              meta: "Convergencia",
              videos: [
                { url: "https://www.youtube.com/watch?v=lXEe11Sfwgo" },
                { url: "https://www.youtube.com/watch?v=-fEptsByODI" }
              ],
              herramientas: [
                {
                  title: "GeoGebra - Límites de sucesiones",
                  url: "https://www.geogebra.org/m/vjfKMFMG",
                  type: "Interactivo"
                },
                {
                  title: "Desmos - Graficadora de puntos de sucesiones",
                  url: "https://www.desmos.com/calculator?lang=es",
                  type: "Graficadora"
                },
                {
                  title: "Proyecto Descartes - Límite de una sucesión",
                  url: "https://proyectodescartes.org/iCartesiLibri/materiales_didacticos/Libro_Calculo_Diferencial-JS/index.html",
                  type: "Interactivo"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Cálculo 2 - Secuencias",
                  url: "https://openstax.org/books/c%C3%A1lculo-volumen-2/pages/5-1-secuencias"
                },
                {
                  title: "Khan Academy - Sucesiones convergentes",
                  url: "https://es.khanacademy.org/math/integral-calculus/ic-series/ic-seq-conv"
                }
              ]
            },
            {
              slug: "series",
              title: "Series",
              meta: "Sumatorias",
              videos: [
                { url: "https://www.youtube.com/watch?v=O16aIAWipTU" },
                { url: "https://www.youtube.com/watch?v=XwAMhXxwzHE" },
                { url: "https://www.youtube.com/watch?v=S-KnzKQC408" }
              ],
              herramientas: [
                {
                  title: "GeoGebra - Progresiones, sucesiones y series",
                  url: "https://www.geogebra.org/m/tfvmd4f9",
                  type: "Interactivo"
                },
                {
                  title: "Symbolab - Calculadora de series",
                  url: "https://es.symbolab.com/solver/series-calculator",
                  type: "Calculadora"
                },
                {
                  title: "Symbolab - Prueba integral para series",
                  url: "https://es.symbolab.com/solver/series-integral-test-calculator",
                  type: "Calculadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Cálculo 2 - Serie infinita",
                  url: "https://openstax.org/books/c%C3%A1lculo-volumen-2/pages/5-2-serie-infinita"
                },
                {
                  title: "Khan Academy - Series",
                  url: "https://es.khanacademy.org/math/integral-calculus/ic-series"
                }
              ]
            }
          ]
        },
        {
          slug: "fisica-1",
          title: "Física I",
          description: "Mecánica y termodinámica.",
          temas: [
            {
              slug: "mediciones",
              title: "Mediciones",
              meta: "Unidades e incertidumbre",
              videos: [
                { url: "https://youtu.be/8moh63kQukE?si=RCZDy6G6HChrroOc" },
                { url: "https://youtu.be/C7cORnM76yI?si=NWiv5QUonj54Vk-5" }
              ],
              herramientas: [
                {
                  title: "Micrómetro virtual interactivo",
                  url: "https://www.stefanelli.eng.br/es/micrometro-virtual-centesimas-milimetro-simulador/",
                  type: "Simulador"
                },
                {
                  title: "Calibre virtual (Vernier) interactivo",
                  url: "https://www.stefanelli.eng.br/es/calibre-virtual-simulador-milimetro-05/",
                  type: "Simulador"
                },
                {
                  title: "OpenStax - Conversión de unidades y análisis dimensional",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/1-3-conversion-de-unidades",
                  type: "Guía interactiva"
                }
              ],
              pdfs: [
                {
                  title: "Apuntes de Mediciones",
                  url: "../../pdfs/fisica-1/mediciones/apuntefisica.pdf.pdf"
                },
                {
                  title: "Errores de Medición e Incertidumbre",
                  url: "../../pdfs/fisica-1/mediciones/errores.pdf.pdf"
                },
                {
                  title: "OpenStax Física Universitaria 1 - Unidades y medidas",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/1-introduccion"
                }
              ]
            },
            {
              slug: "estatica",
              title: "Estática",
              meta: "Equilibrio de fuerzas",
              videos: [
                { url: "https://www.youtube.com/watch?v=W1z7y-bzqUk" },
                { url: "https://www.youtube.com/watch?v=q0qamc5hfh8" }
              ],
              herramientas: [
                {
                  title: "PhET - Acto de equilibrio",
                  url: "https://phet.colorado.edu/es/simulations/balancing-act",
                  type: "Simulador"
                },
                {
                  title: "PhET - Ley de Hooke",
                  url: "https://phet.colorado.edu/es/simulations/hookes-law",
                  type: "Simulador"
                },
                {
                  title: "PhET - Adición de vectores",
                  url: "https://phet.colorado.edu/es/simulations/vector-addition",
                  type: "Simulador"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Condiciones para el equilibrio estático",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/12-1-condiciones-para-el-equilibrio-estatico"
                },
                {
                  title: "Khan Academy - Fuerzas y leyes de Newton",
                  url: "https://es.khanacademy.org/science/physics/forces-newtons-laws"
                }
              ]
            },
            {
              slug: "cinematica",
              title: "Cinemática",
              meta: "Movimiento sin fuerzas",
              videos: [
                { url: "https://www.youtube.com/watch?v=QjYdiIq2weQ" },
                { url: "https://www.youtube.com/watch?v=DjmC8An-5oo" }
              ],
              herramientas: [
                {
                  title: "Fisicalab - Simulación de cinemática",
                  url: "https://www.fisicalab.com/apartado/simulacion-cinematica",
                  type: "Simulador"
                },
                {
                  title: "PhET - Movimiento de proyectiles",
                  url: "https://phet.colorado.edu/es/simulations/projectile-motion",
                  type: "Simulador"
                },
                {
                  title: "Desmos - Gráficas posición, velocidad y aceleración",
                  url: "https://www.desmos.com/calculator?lang=es",
                  type: "Graficadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Movimiento con aceleración constante",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/3-4-movimiento-con-aceleracion-constante"
                },
                {
                  title: "OpenStax Física Universitaria 1 - Movimiento de proyectil",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/4-3-movimiento-de-proyectil"
                }
              ]
            },
            {
              slug: "dinamica",
              title: "Dinámica",
              meta: "Leyes de Newton",
              videos: [
                { url: "https://www.youtube.com/watch?v=iLt6C1oxmlc" },
                { url: "https://www.youtube.com/watch?v=D7IifMbjdUk" }
              ],
              herramientas: [
                {
                  title: "PhET - Fuerzas y movimiento: conceptos básicos",
                  url: "https://phet.colorado.edu/es/simulations/forces-and-motion-basics",
                  type: "Simulador"
                },
                {
                  title: "PhET - Fuerzas en una dimensión",
                  url: "https://phet.colorado.edu/es/simulations/forces-1d",
                  type: "Simulador"
                },
                {
                  title: "Fisicalab - Leyes de Newton",
                  url: "https://www.fisicalab.com/tema/aplicando-leyes-newton",
                  type: "Problemas interactivos"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Leyes del movimiento de Newton",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/5-introduccion"
                },
                {
                  title: "OpenStax Física Universitaria 1 - Resolución con leyes de Newton",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/6-1-resolucion-de-problemas-con-las-leyes-de-newton"
                }
              ]
            },
            {
              slug: "trabajo-energia",
              title: "Trabajo y energía",
              meta: "Energía mecánica",
              videos: [
                { url: "https://www.youtube.com/watch?v=RNKgvrnyRgE" },
                { url: "https://www.youtube.com/watch?v=SCfKwt9RwMQ" }
              ],
              herramientas: [
                {
                  title: "PhET - Parque energético para patinadores",
                  url: "https://phet.colorado.edu/es/simulations/energy-skate-park",
                  type: "Simulador"
                },
                {
                  title: "PhET - Formas y cambios de energía",
                  url: "https://phet.colorado.edu/es/simulations/energy-forms-and-changes",
                  type: "Simulador"
                },
                {
                  title: "Fisicalab - Trabajo y energía",
                  url: "https://www.fisicalab.com/tema/trabajo-energia-potencia",
                  type: "Problemas interactivos"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Trabajo y energía cinética",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/7-introduccion"
                },
                {
                  title: "Khan Academy - Trabajo y energía",
                  url: "https://es.khanacademy.org/science/physics/work-and-energy"
                }
              ]
            },
            {
              slug: "cantidad-movimiento",
              title: "Cantidad de movimiento",
              meta: "Choques e impulso",
              videos: [
                { url: "https://www.youtube.com/watch?v=mes4Ui0NdFc" },
                { url: "https://www.youtube.com/watch?v=q7nGK4ncFB4" }
              ],
              herramientas: [
                {
                  title: "PhET - Laboratorio de colisiones",
                  url: "https://phet.colorado.edu/es/simulations/collision-lab",
                  type: "Simulador"
                },
                {
                  title: "Educaplus - Momento lineal",
                  url: "https://www.educaplus.org/games/fisica",
                  type: "Interactivo"
                },
                {
                  title: "Fisicalab - Cantidad de movimiento",
                  url: "https://www.fisicalab.com/apartado/cantidad-movimiento",
                  type: "Problemas interactivos"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Momento lineal",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/9-1-momento-lineal"
                },
                {
                  title: "OpenStax Física Universitaria 1 - Conservación del momento lineal",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/9-3-conservacion-del-momento-lineal"
                }
              ]
            },
            {
              slug: "rotaciones",
              title: "Rotaciones",
              meta: "Movimiento angular",
              videos: [
                { url: "https://www.youtube.com/watch?v=yzrk3LqH31w" },
                { url: "https://www.youtube.com/watch?v=vYMF2ssuMSQ" }
              ],
              herramientas: [
                {
                  title: "PhET - Torque",
                  url: "https://phet.colorado.edu/es/simulations/torque",
                  type: "Simulador"
                },
                {
                  title: "PhET - Acto de equilibrio",
                  url: "https://phet.colorado.edu/es/simulations/balancing-act",
                  type: "Simulador"
                },
                {
                  title: "PhET - Movimiento de una mariquita en 2D",
                  url: "https://phet.colorado.edu/es/simulations/ladybug-motion-2d",
                  type: "Simulador"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Variables rotacionales",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/10-1-variables-rotacionales"
                },
                {
                  title: "OpenStax Física Universitaria 1 - Conservación del momento angular",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/11-3-conservacion-del-momento-angular"
                }
              ]
            },
            {
              slug: "moas",
              title: "Movimiento oscilatorio",
              meta: "Oscilaciones",
              videos: [
                { url: "https://www.youtube.com/watch?v=FfLrru24pNI" },
                { url: "https://www.youtube.com/watch?v=uB0gf_Hz2wY" }
              ],
              herramientas: [
                {
                  title: "PhET - Masas y resortes",
                  url: "https://phet.colorado.edu/es/simulations/masses-and-springs",
                  type: "Simulador"
                },
                {
                  title: "PhET - Péndulo",
                  url: "https://phet.colorado.edu/es/simulations/pendulum-lab",
                  type: "Simulador"
                },
                {
                  title: "PhET - Resortes y masas",
                  url: "https://phet.colorado.edu/es/simulations/hookes-law",
                  type: "Simulador"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Movimiento armónico simple",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/15-1-movimiento-armonico-simple"
                },
                {
                  title: "Khan Academy - Movimiento oscilatorio",
                  url: "https://es.khanacademy.org/science/physics/mechanical-waves-and-sound/harmonic-motion"
                }
              ]
            },
            {
              slug: "elasticidad",
              title: "Elasticidad",
              meta: "Deformaciones",
              videos: [
                { url: "https://www.youtube.com/watch?v=WLSA77ByVdI" },
                { url: "https://www.youtube.com/watch?v=YectKJB2zxM" }
              ],
              herramientas: [
                {
                  title: "PhET - Ley de Hooke",
                  url: "https://phet.colorado.edu/es/simulations/hookes-law",
                  type: "Simulador"
                },
                {
                  title: "PhET - Masas y resortes",
                  url: "https://phet.colorado.edu/es/simulations/masses-and-springs",
                  type: "Simulador"
                },
                {
                  title: "Fisicalab - Ley de Hooke",
                  url: "https://www.fisicalab.com/apartado/ley-hooke",
                  type: "Problemas interactivos"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Elasticidad",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/12-4-elasticidad-y-plasticidad"
                },
                {
                  title: "Khan Academy - Fuerzas de resorte",
                  url: "https://es.khanacademy.org/science/physics/work-and-energy/hookes-law"
                }
              ]
            },
            {
              slug: "fluidos",
              title: "Fluidos",
              meta: "Presión y Bernoulli",
              videos: [
                { url: "https://www.youtube.com/watch?v=i8UkNtyJhno" },
                { url: "https://www.youtube.com/watch?v=4ciEee-80Gs" }
              ],
              herramientas: [
                {
                  title: "PhET - Presión bajo el agua",
                  url: "https://phet.colorado.edu/es/simulations/under-pressure",
                  type: "Simulador"
                },
                {
                  title: "PhET - Flotabilidad",
                  url: "https://phet.colorado.edu/es/simulations/buoyancy",
                  type: "Simulador"
                },
                {
                  title: "PhET - Presión y flujo de fluidos",
                  url: "https://phet.colorado.edu/es/simulations/fluid-pressure-and-flow",
                  type: "Simulador"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Fluidos, densidad y presión",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/14-1-fluidos-densidad-y-presion"
                },
                {
                  title: "OpenStax Física Universitaria 1 - Dinámica de fluidos",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/14-5-dinamicas-de-fluidos"
                }
              ]
            },
            {
              slug: "calorimetria",
              title: "Calorimetría",
              meta: "Transferencia de calor",
              videos: [
                { url: "https://www.youtube.com/watch?v=Q0rELRDUMjA" },
                { url: "https://www.youtube.com/watch?v=-vJaYp3an-0" }
              ],
              herramientas: [
                {
                  title: "PhET - Formas y cambios de energía",
                  url: "https://phet.colorado.edu/es/simulations/energy-forms-and-changes",
                  type: "Simulador"
                },
                {
                  title: "PhET - Estados de la materia",
                  url: "https://phet.colorado.edu/es/simulations/states-of-matter",
                  type: "Simulador"
                },
                {
                  title: "Fisicalab - Calorimetría",
                  url: "https://www.fisicalab.com/tema/termodinamica-fisica/ejercicios",
                  type: "Problemas interactivos"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 2 - Calor específico y calorimetría",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-2/pages/1-4-transferencia-de-calor-calor-especifico-y-calorimetria"
                },
                {
                  title: "Khan Academy - Termodinámica",
                  url: "https://es.khanacademy.org/science/physics/thermodynamics"
                }
              ]
            },
            {
              slug: "termodinamica",
              title: "Termodinámica",
              meta: "Leyes térmicas",
              videos: [
                { url: "https://www.youtube.com/watch?v=ZLAoKBVglU8" },
                { url: "https://www.youtube.com/watch?v=JSc0doZAY-k" }
              ],
              herramientas: [
                {
                  title: "PhET - Propiedades de los gases",
                  url: "https://phet.colorado.edu/es/simulations/gas-properties",
                  type: "Simulador"
                },
                {
                  title: "PhET - Estados de la materia",
                  url: "https://phet.colorado.edu/es/simulations/states-of-matter",
                  type: "Simulador"
                },
                {
                  title: "Educaplus - Temperatura y energía cinética",
                  url: "https://www.educaplus.org/games/fisica",
                  type: "Interactivo"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 2 - Primera ley de la termodinámica",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-2/pages/3-3-primera-ley-de-la-termodinamica"
                },
                {
                  title: "OpenStax Física Universitaria 2 - Segunda ley de la termodinámica",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-2/pages/4-4-enunciados-de-la-segunda-ley-de-la-termodinamica"
                }
              ]
            },
            {
              slug: "ondas",
              title: "Ondas",
              meta: "Propagación",
              videos: [
                { url: "https://www.youtube.com/watch?v=okSglkoeE00" },
                { url: "https://www.youtube.com/watch?v=zCfGyBfpHhQ" }
              ],
              herramientas: [
                {
                  title: "PhET - Onda en una cuerda",
                  url: "https://phet.colorado.edu/es/simulations/wave-on-a-string",
                  type: "Simulador"
                },
                {
                  title: "PhET - Introducción a las ondas",
                  url: "https://phet.colorado.edu/es/simulations/waves-intro",
                  type: "Simulador"
                },
                {
                  title: "PhET - Fourier: creando ondas",
                  url: "https://phet.colorado.edu/es/simulations/fourier-making-waves",
                  type: "Simulador"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Ondas",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/16-introduccion"
                },
                {
                  title: "Khan Academy - Ondas mecánicas",
                  url: "https://es.khanacademy.org/science/physics/mechanical-waves-and-sound"
                }
              ]
            },
            {
              slug: "sonido",
              title: "Sonido",
              meta: "Acústica",
              videos: [
                { url: "https://www.youtube.com/watch?v=zabKFFhiB-M" },
                { url: "https://www.youtube.com/watch?v=sYGw6p-bSwc" }
              ],
              herramientas: [
                {
                  title: "PhET - Ondas sonoras",
                  url: "https://phet.colorado.edu/es/simulations/sound",
                  type: "Simulador"
                },
                {
                  title: "PhET - Interferencia de ondas",
                  url: "https://phet.colorado.edu/es/simulations/wave-interference",
                  type: "Simulador"
                },
                {
                  title: "Educaplus - Sonido y ondas",
                  url: "https://www.educaplus.org/games/fisica",
                  type: "Interactivo"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Física Universitaria 1 - Sonido",
                  url: "https://openstax.org/books/f%C3%ADsica-universitaria-volumen-1/pages/17-introduccion"
                },
                {
                  title: "Khan Academy - Ondas mecánicas y sonido",
                  url: "https://es.khanacademy.org/science/physics/mechanical-waves-and-sound"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

window.DATA = DATA;

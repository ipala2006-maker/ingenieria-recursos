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
  { url: "https://youtu.be/C7cORnM76yI?si=NWiv5QUonj54Vk-5" },
  { url: "https://youtu.be/jg5_NNh9hq4?si=hQDVYFZYDWBEl3Cf" },
  { url: "https://youtu.be/CXOdNH9KMOQ?si=Ug68TQoE-FtcjQyN" }
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
    title: "Magnitudes Físicas",
    url: "../../pdfs/fisica-1/mediciones/magnitudes.pdf.pdf"
  }
]
},
            { slug: "estatica", title: "Estática", meta: "Equilibrio de fuerzas" },
            { slug: "cinematica", title: "Cinemática", meta: "Movimiento sin fuerzas" },
            { slug: "dinamica", title: "Dinámica", meta: "Leyes de Newton" },
            { slug: "trabajo-energia", title: "Trabajo y energía", meta: "Energía mecánica" },
            { slug: "cantidad-movimiento", title: "Cantidad de movimiento", meta: "Choques e impulso" },
            { slug: "rotaciones", title: "Rotaciones", meta: "Movimiento angular" },
            { slug: "moas", title: "Movimiento oscilatorio", meta: "Oscilaciones" },
            { slug: "elasticidad", title: "Elasticidad", meta: "Deformaciones" },
            { slug: "fluidos", title: "Fluidos", meta: "Presión y Bernoulli" },
            { slug: "calorimetria", title: "Calorimetría", meta: "Transferencia de calor" },
            { slug: "termodinamica", title: "Termodinámica", meta: "Leyes térmicas" },
            { slug: "ondas", title: "Ondas", meta: "Propagación" },
            { slug: "sonido", title: "Sonido", meta: "Acústica" }
          ]
        }
      ]
    }
  ]
};

window.DATA = DATA;

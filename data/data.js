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
                { url: "https://www.youtube.com/watch?v=kAv5pahIevE" },
                { url: "https://www.youtube.com/watch?v=pYVVPqphPS0" },
                { url: "https://www.youtube.com/watch?v=54_XRjHhZzI" }
              ],
              herramientas: [
                {
                  title: "GeoGebra - Límites y continuidad",
                  url: "https://www.geogebra.org/m/yn6xudfs",
                  type: "Interactivo"
                },
                {
                  title: "WolframAlpha - Calculadora de límites",
                  url: "https://www.wolframalpha.com/calculators/limit-calculator",
                  type: "Calculadora"
                },
                {
                  title: "Symbolab - Calculadora de límites paso a paso",
                  url: "https://www.symbolab.com/solver/limit-calculator",
                  type: "Calculadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Calculus 1 - Limits",
                  url: "https://openstax.org/books/calculus-volume-1/pages/2-introduction"
                },
                {
                  title: "Paul's Online Math Notes - Limits",
                  url: "https://tutorial.math.lamar.edu/classes/calci/limitsintro.aspx"
                },
                {
                  title: "Khan Academy - Límites y continuidad",
                  url: "https://es.khanacademy.org/math/calculus-all-old/limits-and-continuity-calc"
                }
              ]
            },
            {
              slug: "continuidad",
              title: "Continuidad",
              meta: "Propiedades",
              videos: [
                { url: "https://www.youtube.com/watch?v=riXcZT2ICjA" },
                { url: "https://www.youtube.com/watch?v=3KMqU5j7irw" }
              ],
              herramientas: [
                {
                  title: "Desmos - Graficadora para explorar discontinuidades",
                  url: "https://www.desmos.com/calculator?lang=es",
                  type: "Graficadora"
                },
                {
                  title: "GeoGebra - Interactive Calculus Figures",
                  url: "https://www.geogebra.org/m/yn6xudfs",
                  type: "Interactivo"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Calculus 1 - Continuity",
                  url: "https://openstax.org/books/calculus-volume-1/pages/2-4-continuity"
                },
                {
                  title: "Paul's Online Math Notes - Continuity",
                  url: "https://tutorial.math.lamar.edu/classes/calci/continuity.aspx"
                },
                {
                  title: "MIT OCW 18.01SC - Limits and Continuity",
                  url: "https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/pages/1.-differentiation/part-a-definition-and-basic-rules/session-4-limits-and-continuity/"
                }
              ]
            },
            {
              slug: "derivadas",
              title: "Derivadas",
              meta: "Tasa de cambio",
              videos: [
                { url: "https://www.youtube.com/watch?v=_nbtaQtX6JA" },
                { url: "https://www.youtube.com/watch?v=7K1sB05pE0A" },
                { url: "https://www.youtube.com/watch?v=Gbtma_UQpro" }
              ],
              herramientas: [
                {
                  title: "GeoGebra - Derivada como pendiente",
                  url: "https://www.geogebra.org/m/yn6xudfs",
                  type: "Interactivo"
                },
                {
                  title: "Desmos - Graficadora con derivadas",
                  url: "https://www.desmos.com/calculator?lang=es",
                  type: "Graficadora"
                },
                {
                  title: "Symbolab - Calculadora de derivadas",
                  url: "https://www.symbolab.com/solver/derivative-calculator",
                  type: "Calculadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Calculus 1 - Derivatives",
                  url: "https://openstax.org/books/calculus-volume-1/pages/3-introduction"
                },
                {
                  title: "Paul's Online Math Notes - Derivatives",
                  url: "https://tutorial.math.lamar.edu/classes/calci/DerivativeIntro.aspx"
                },
                {
                  title: "MIT OCW 18.01SC - Definition of Derivative",
                  url: "https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/pages/1.-differentiation/part-a-definition-and-basic-rules/session-2-examples-of-derivatives/"
                }
              ]
            },
            {
              slug: "integrales",
              title: "Integrales",
              meta: "Acumulación",
              videos: [
                { url: "https://www.youtube.com/watch?v=13UPhn32Mjs" },
                { url: "https://www.youtube.com/watch?v=C9luv3o6emw" },
                { url: "https://www.youtube.com/watch?v=Mxjyb1yII-8" }
              ],
              herramientas: [
                {
                  title: "GeoGebra - Sumas de Riemann e integrales",
                  url: "https://www.geogebra.org/m/yn6xudfs",
                  type: "Interactivo"
                },
                {
                  title: "WolframAlpha - Calculadora de integrales",
                  url: "https://www.wolframalpha.com/calculators/integral-calculator",
                  type: "Calculadora"
                },
                {
                  title: "Symbolab - Calculadora de integrales paso a paso",
                  url: "https://www.symbolab.com/solver/integral-calculator",
                  type: "Calculadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Calculus 1 - Integration",
                  url: "https://openstax.org/books/calculus-volume-1/pages/5-introduction"
                },
                {
                  title: "OpenStax Calculus 2 - Techniques of Integration",
                  url: "https://openstax.org/books/calculus-volume-2/pages/3-introduction"
                },
                {
                  title: "Paul's Online Math Notes - Integrals",
                  url: "https://tutorial.math.lamar.edu/classes/calci/IntegralsIntro.aspx"
                }
              ]
            },
            {
              slug: "sucesiones",
              title: "Sucesiones",
              meta: "Convergencia",
              videos: [
                { url: "https://www.youtube.com/watch?v=iHErQuZ8M-I" },
                { url: "https://www.youtube.com/watch?v=LpW6zanbSf8" }
              ],
              herramientas: [
                {
                  title: "GeoGebra - Sucesiones y series",
                  url: "https://www.geogebra.org/m/YpqytNph",
                  type: "Interactivo"
                },
                {
                  title: "WolframAlpha - Explorador de sucesiones",
                  url: "https://www.wolframalpha.com/examples/mathematics/calculus-and-analysis/sequences/",
                  type: "Calculadora"
                },
                {
                  title: "Desmos - Graficadora de puntos de sucesiones",
                  url: "https://www.desmos.com/calculator?lang=es",
                  type: "Graficadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Calculus 2 - Sequences",
                  url: "https://openstax.org/books/calculus-volume-2/pages/5-1-sequences"
                },
                {
                  title: "Paul's Online Math Notes - Sequences",
                  url: "https://tutorial.math.lamar.edu/classes/calcii/Sequences.aspx"
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
                { url: "https://www.youtube.com/watch?v=LpW6zanbSf8" },
                { url: "https://www.youtube.com/watch?v=RzSp9nIFnbo" },
                { url: "https://www.youtube.com/watch?v=rUis1mSzwyA" }
              ],
              herramientas: [
                {
                  title: "GeoGebra - Series infinitas",
                  url: "https://www.geogebra.org/m/YpqytNph",
                  type: "Interactivo"
                },
                {
                  title: "WolframAlpha - Sumas y series",
                  url: "https://www.wolframalpha.com/examples/mathematics/calculus-and-analysis/sums",
                  type: "Calculadora"
                },
                {
                  title: "Symbolab - Calculadora de series",
                  url: "https://www.symbolab.com/solver/series-calculator",
                  type: "Calculadora"
                }
              ],
              pdfs: [
                {
                  title: "OpenStax Calculus 2 - Sequences and Series",
                  url: "https://openstax.org/books/calculus-volume-2/pages/5-introduction"
                },
                {
                  title: "Paul's Online Math Notes - Series",
                  url: "https://tutorial.math.lamar.edu/classes/calcii/SeriesIntro.aspx"
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

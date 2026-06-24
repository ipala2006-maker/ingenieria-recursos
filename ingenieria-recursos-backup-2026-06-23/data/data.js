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
            { slug: "limites", title: "Límites", meta: "Base para cálculo" },
            { slug: "continuidad", title: "Continuidad", meta: "Propiedades" },
            { slug: "derivadas", title: "Derivadas", meta: "Tasa de cambio" },
            { slug: "integrales", title: "Integrales", meta: "Acumulación" },
            { slug: "sucesiones", title: "Sucesiones", meta: "Convergencia" },
            { slug: "series", title: "Series", meta: "Sumatorias" }
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

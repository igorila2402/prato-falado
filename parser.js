"use strict";
/* Prato Falado — interpretador do ditado (sem IA, só regras).
   Uso no navegador: <script src="parser.js"></script> → window.PFParser
   Uso no Node (testes): const PFParser = require('./parser.js')
   API: init(tacoRows), setContext({products, aliases, mealNames}), parse(text),
        search(q, max), foodFromRef(ref), norm(str). */
(function(root){

/* ---------- Alimentos comuns que faltam na TACO (por 100 g) ----------
   Colunas: nome, kcal, prot, carb, gord, fibra, sódio mg, cálcio mg, ferro mg, vit C mg, potássio mg, magnésio mg, zinco mg.
   ATENÇÃO: os 8 primeiros mantêm a ordem antiga (refs T597..T604 já salvas). Novos sempre no fim. */
const EXTRAS = [
  ['Macarrão, trigo, cozido',158,5.8,30.9,0.9,1.8,1,7,0.5,0,44,18,0.5],
  ['Whey protein (média)',390,78,8,6,0,200,400,1,0,500,100,2],
  ['Pizza de mussarela (média)',270,11,31,11,2,600,180,1.5,1,170,20,1.3],
  ['Granola (média)',420,9,65,14,7,30,50,3,0,350,100,2],
  ['Linguiça toscana, grelhada (média)',300,18,1,25,0,1000,10,1,0,250,18,2.5],
  ['Salsicha (média)',250,12,5,20,0,1000,30,1.2,0,180,15,1.5],
  ['Água de coco',22,0,5.3,0,0,25,20,0.3,2,250,25,0.1],
  ['Tilápia, filé, grelhado (média)',128,26,0,2.7,0,56,10,0.7,0,380,34,0.4],
  // novos: a TACO traz o leite com kcal e macros vazios (0) — estes têm valores reais
  ['Leite, de vaca, integral (média)',61,3.2,4.7,3.3,0,64,123,0,0,133,10,0.4],
  ['Leite, de vaca, desnatado (média)',35,3.4,4.9,0.2,0,51,134,0,0,140,10,0.4],
  ['Leite, de vaca, semidesnatado (média)',46,3.3,4.8,1.5,0,50,120,0,0,140,11,0.4],
  ['Água, potável (média)',0,0,0,0,0,1,3,0,0,0,1,0],
  ['Ovo, de galinha, mexido (média)',149,10,1.6,11,0,145,66,1.3,0,132,11,0.9],
  ['Grão-de-bico, cozido (média)',164,8.9,27.4,2.6,7.6,7,49,2.9,1.3,291,48,1.5],
  ['Purê de batata (média)',105,1.9,15.5,4,1.4,300,25,0.3,7,280,18,0.3],
  ['Sorvete, de massa (média)',207,3.5,23.6,11,0.7,80,128,0.1,0.6,199,14,0.7],
  ['Vinho, tinto (média)',85,0.1,2.6,0,0,4,8,0.5,0,127,12,0.1],
  ['Refrigerante, zero (média)',1,0,0.1,0,0,12,2,0.1,0,4,1,0],
  ['Pão, de hambúrguer (média)',280,9,50,4.5,2.3,450,60,3,0,120,25,0.8],
  ['Peito de peru, fatiado (média)',100,18,2,2,0,1000,10,0.6,0,300,20,1],
  ['Sopa de legumes (média)',45,1.5,7,1.2,1.2,250,15,0.4,4,150,10,0.2],
  ['Caldo de carne com legumes (média)',60,4.5,5,2.5,0.8,300,12,0.6,3,160,10,0.8],
];

/* ---------- Termos do dia a dia → nome exato na TACO/EXTRAS ----------
   Chaves sem acento. Plural/singular é tratado automaticamente. O dicionário pessoal tem prioridade. */
const PAT='Carne, bovina, patinho, sem gordura, grelhado', FRANGO='Frango, peito, sem pele, grelhado';
const LEITE='Leite, de vaca, integral (média)', OVO='Ovo, de galinha, inteiro, cozido/10minutos';
const SYN = {
  // arroz, feijão e acompanhamentos
  'arroz':'Arroz, tipo 1, cozido','arroz branco':'Arroz, tipo 1, cozido','arroz cozido':'Arroz, tipo 1, cozido','arroz integral':'Arroz, integral, cozido','arroz carreteiro':'Arroz carreteiro','carreteiro':'Arroz carreteiro',
  'feijao':'Feijão, carioca, cozido','feijao carioca':'Feijão, carioca, cozido','feijao preto':'Feijão, preto, cozido','feijao de corda':'Feijão, fradinho, cozido','feijao verde':'Feijão, fradinho, cozido','feijao fradinho':'Feijão, fradinho, cozido','feijao rajado':'Feijão, rajado, cozido','feijao roxo':'Feijão, roxo, cozido','feijao rosinha':'Feijão, rosinha, cozido','feijao jalo':'Feijão, jalo, cozido','caldo de feijao':'Feijão, carioca, cozido',
  'feijao tropeiro':'Feijão tropeiro mineiro','tropeiro':'Feijão tropeiro mineiro','feijoada':'Feijoada','baiao':'Baião de dois, arroz e feijão-de-corda','baiao de dois':'Baião de dois, arroz e feijão-de-corda',
  'lentilha':'Lentilha, cozida','grao de bico':'Grão-de-bico, cozido (média)','ervilha':'Ervilha, enlatada, drenada','milho':'Milho, verde, enlatado, drenado','milho verde':'Milho, verde, enlatado, drenado',
  'farofa':'Mandioca, farofa, temperada','farinha':'Farinha, de mandioca, torrada','farinha de mandioca':'Farinha, de mandioca, torrada','farinha dagua':'Farinha, de mandioca, torrada','farinha d agua':'Farinha, de mandioca, torrada','farinha de puba':'Farinha, de puba','farinha de milho':'Farinha, de milho, amarela','farinha de trigo':'Farinha, de trigo','farinha de rosca':'Farinha, de rosca',
  'cuscuz':'Cuscuz, de milho, cozido com sal','cuscuz de milho':'Cuscuz, de milho, cozido com sal','cuscuz nordestino':'Cuscuz, de milho, cozido com sal','cuscuz paulista':'Cuscuz, paulista',
  'tapioca':'Tapioca, com manteiga','beiju':'Tapioca, com manteiga','tapioca com manteiga':'Tapioca, com manteiga','goma':'Fécula, de mandioca','polvilho':'Polvilho, doce',
  'macarrao':'Macarrão, trigo, cozido','massa':'Macarrão, trigo, cozido','espaguete':'Macarrão, trigo, cozido','talharim':'Macarrão, trigo, cozido','parafuso':'Macarrão, trigo, cozido','penne':'Macarrão, trigo, cozido','miojo':'Macarrão, instantâneo','macarrao instantaneo':'Macarrão, instantâneo','lamen':'Macarrão, instantâneo',
  'macarronada':'Macarrão, molho bolognesa','macarrao com molho':'Macarrão, molho bolognesa','macarrao a bolonhesa':'Macarrão, molho bolognesa','macarrao bolonhesa':'Macarrão, molho bolognesa','lasanha':'Lasanha, massa fresca, cozida','nhoque':'Nhoque, batata, cozido','yakisoba':'Yakisoba','polenta':'Polenta, pré-cozida','pamonha':'Pamonha, barra para cozimento, pré-cozida','canjica':'Canjica, com leite integral','mungunza':'Canjica, com leite integral','curau':'Curau, milho verde',
  'pure':'Purê de batata (média)','sopa':'Sopa de legumes (média)','sopa de legumes':'Sopa de legumes (média)','sopa de legume':'Sopa de legumes (média)','canja':'Caldo de carne com legumes (média)','caldo':'Caldo de carne com legumes (média)','caldo de carne':'Caldo de carne com legumes (média)','sopa de carne':'Caldo de carne com legumes (média)','caldinho':'Caldo de carne com legumes (média)','pure de batata':'Purê de batata (média)',
  // carnes
  'carne':PAT,'carne bovina':PAT,'carne de boi':PAT,'carne vermelha':PAT,'carne grelhada':PAT,'bife':PAT,'bife grelhado':PAT,'bife bovino':PAT,'patinho':PAT,'file':PAT,
  'carne moida':'Carne, bovina, acém, moído, cozido','moida':'Carne, bovina, acém, moído, cozido','acem':'Carne, bovina, acém, sem gordura, cozido','carne de panela':'Carne, bovina, acém, sem gordura, cozido','carne cozida':'Carne, bovina, acém, sem gordura, cozido','picadinho':'Carne, bovina, acém, sem gordura, cozido','carne assada':'Carne, bovina, maminha, grelhada',
  'picanha':'Carne, bovina, picanha, com gordura, grelhada','maminha':'Carne, bovina, maminha, grelhada','alcatra':'Carne, bovina, miolo de alcatra, sem gordura, grelhado','miolo de alcatra':'Carne, bovina, miolo de alcatra, sem gordura, grelhado','contra file':'Carne, bovina, contra-filé, sem gordura, grelhado','contrafile':'Carne, bovina, contra-filé, sem gordura, grelhado','file mignon':'Carne, bovina, filé mingnon, sem gordura, grelhado','fraldinha':'Carne, bovina, fraldinha, com gordura, cozida','cupim':'Carne, bovina, cupim, assado','costela':'Carne, bovina, costela, assada','costela bovina':'Carne, bovina, costela, assada','lagarto':'Carne, bovina, lagarto, cozido','figado':'Carne, bovina, fígado, grelhado','bucho':'Carne, bovina, bucho, cozido','coxao mole':'Carne, bovina, coxão mole, sem gordura, cozido','coxao duro':'Carne, bovina, coxão duro, sem gordura, cozido','musculo':'Carne, bovina, músculo, sem gordura, cozido','lingua':'Carne, bovina, língua, cozida','almondega':'Carne, bovina, almôndegas, fritas','bife a milanesa':'Carne, bovina, contra-filé, à milanesa','bife a cavalo':'Bife à cavalo, com contra filé',
  'carne seca':'Carne, bovina, seca, cozida','carne de sol':'Carne, bovina, seca, cozida','charque':'Carne, bovina, charque, cozido','jaba':'Carne, bovina, charque, cozido',
  'estrogonofe':'Estrogonofe de carne','strogonoff':'Estrogonofe de carne','estrogonofe de carne':'Estrogonofe de carne','estrogonofe de frango':'Estrogonofe de frango','strogonoff de frango':'Estrogonofe de frango','vaca atolada':'Vaca atolada','dobradinha':'Dobradinha','sarapatel':'Sarapatel','quibebe':'Quibebe','barreado':'Barreado',
  'frango':FRANGO,'peito de frango':FRANGO,'file de frango':FRANGO,'frango grelhado':FRANGO,'galinha':FRANGO,'peito':FRANGO,'sassami':FRANGO,
  'frango cozido':'Frango, peito, sem pele, cozido','frango desfiado':'Frango, peito, sem pele, cozido','frango assado':'Frango, inteiro, sem pele, assado','galinha caipira':'Frango, caipira, inteiro, sem pele, cozido','frango caipira':'Frango, caipira, inteiro, sem pele, cozido','galinhada':'Frango, com açafrão','frango com acafrao':'Frango, com açafrão',
  'coxa':'Frango, coxa, sem pele, cozida','coxa de frango':'Frango, coxa, sem pele, cozida','sobrecoxa':'Frango, sobrecoxa, sem pele, assada','sobrecoxa de frango':'Frango, sobrecoxa, sem pele, assada','frango a milanesa':'Frango, filé, à milanesa','file de frango a milanesa':'Frango, filé, à milanesa','coracao de frango':'Frango, coração, grelhado','coracaozinho':'Frango, coração, grelhado','figado de frango':'Frango, fígado, cru',
  'porco':'Porco, lombo, assado','carne de porco':'Porco, lombo, assado','lombo':'Porco, lombo, assado','lombo de porco':'Porco, lombo, assado','bisteca':'Porco, bisteca, grelhada','bisteca de porco':'Porco, bisteca, grelhada','pernil':'Porco, pernil, assado','costela de porco':'Porco, costela, assada','toucinho':'Toucinho, frito','torresmo':'Toucinho, frito','bacon':'Toucinho, frito',
  'linguica':'Linguiça toscana, grelhada (média)','linguica toscana':'Linguiça toscana, grelhada (média)','linguica de frango':'Lingüiça, frango, grelhada','linguica de porco':'Lingüiça, porco, grelhada','calabresa':'Lingüiça, porco, grelhada','linguica calabresa':'Lingüiça, porco, grelhada','salsicha':'Salsicha (média)','hamburguer':'Hambúrguer, bovino, grelhado','hamburger':'Hambúrguer, bovino, grelhado',
  'presunto':'Presunto, sem capa de gordura','apresuntado':'Apresuntado','mortadela':'Mortadela','salame':'Salame','peito de peru':'Peito de peru, fatiado (média)','peru':'Peru, congelado, assado',
  // peixes
  'peixe':'Tilápia, filé, grelhado (média)','tilapia':'Tilápia, filé, grelhado (média)','file de peixe':'Tilápia, filé, grelhado (média)','peixe grelhado':'Tilápia, filé, grelhado (média)','peixe assado':'Tilápia, filé, grelhado (média)','peixe frito':'Pescada, filé, frito','pescada':'Pescada, filé, frito','merluza':'Merluza, filé, assado','pintado':'Pintado, grelhado','surubim':'Pintado, grelhado','tucunare':'Tucunaré, filé, congelado, cru','sardinha':'Sardinha, conserva em óleo','sardinha frita':'Sardinha, frita','atum':'Atum, conserva em óleo','salmao':'Salmão, sem pele, fresco, grelhado','bacalhau':'Bacalhau, salgado, refogado','camarao':'Camarão, Rio Grande, grande, cozido','camarao frito':'Camarão, Sete Barbas, sem cabeça, com casca, frito','camarao a baiana':'Camarão à baiana','caranguejo':'Caranguejo, cozido','cacao':'Cação, posta, cozida',
  // ovos
  'ovo':OVO,'ovo cozido':OVO,'ovo de galinha':OVO,'ovo frito':'Ovo, de galinha, inteiro, frito','ovo mexido':'Ovo, de galinha, mexido (média)','ovos mexidos':'Ovo, de galinha, mexido (média)','omelete':'Omelete, de queijo','omelete de queijo':'Omelete, de queijo','ovo de codorna':'Ovo, de codorna, inteiro, cru','clara':'Ovo, de galinha, clara, cozida/10minutos','clara de ovo':'Ovo, de galinha, clara, cozida/10minutos','gema':'Ovo, de galinha, gema, cozida/10minutos',
  // pães, lanches e salgados
  'pao':'Pão, trigo, francês','pao frances':'Pão, trigo, francês','pao de sal':'Pão, trigo, francês','pao carioquinha':'Pão, trigo, francês','pao careca':'Pão, trigo, francês','pao massa fina':'Pão, trigo, francês','cacetinho':'Pão, trigo, francês','pao integral':'Pão, trigo, forma, integral','pao de forma':'Pão, trigo, forma, integral','pao de forma integral':'Pão, trigo, forma, integral','pao de leite':'Pão, trigo, sovado','pao sovado':'Pão, trigo, sovado','pao doce':'Pão, trigo, sovado','pao de milho':'Pão, milho, forma','pao de aveia':'Pão, aveia, forma','pao de queijo':'Pão, de queijo, assado','pao de hamburguer':'Pão, de hambúrguer (média)','torrada':'Torrada, pão francês',
  'coxinha':'Coxinha de frango, frita','salgado':'Coxinha de frango, frita','salgadinho':'Coxinha de frango, frita','pastel':'Pastel, de carne, frito','pastel de carne':'Pastel, de carne, frito','pastel de queijo':'Pastel, de queijo, frito','empada':'Empada de frango, pré-cozida, assada','empadinha':'Empada de frango, pré-cozida, assada','quibe':'Quibe, frito','kibe':'Quibe, frito','quibe assado':'Quibe, assado','croquete':'Croquete, de carne, frito','bolinho de arroz':'Bolinho de arroz','acaraje':'Acarajé','pizza':'Pizza de mussarela (média)',
  'biscoito':'Biscoito, salgado, cream cracker','bolacha':'Biscoito, salgado, cream cracker','cream cracker':'Biscoito, salgado, cream cracker','biscoito agua e sal':'Biscoito, salgado, cream cracker','bolacha agua e sal':'Biscoito, salgado, cream cracker','biscoito recheado':'Biscoito, doce, recheado com chocolate','bolacha recheada':'Biscoito, doce, recheado com chocolate','biscoito maisena':'Biscoito, doce, maisena','bolacha maisena':'Biscoito, doce, maisena','maisena':'Biscoito, doce, maisena','biscoito de polvilho':'Biscoito, polvilho doce','biscoito de povilho':'Biscoito, polvilho doce','wafer':'Biscoito, doce, wafer, recheado de chocolate',
  'bolo':'Bolo, pronto, chocolate','bolo de chocolate':'Bolo, pronto, chocolate','bolo de milho':'Bolo, pronto, milho','bolo de fuba':'Bolo, pronto, milho','bolo de coco':'Bolo, pronto, coco','bolo de macaxeira':'Bolo, pronto, aipim','bolo de aipim':'Bolo, pronto, aipim','bolo de mandioca':'Bolo, pronto, aipim','pe de moleque':'Pé-de-moleque, amendoim','pacoca':'Paçoca, amendoim','pipoca':'Pipoca, com óleo de soja, sem sal','batata chips':'Batata, frita, tipo chips, industrializada','chips':'Batata, frita, tipo chips, industrializada',
  // tubérculos, legumes e verduras
  'batata':'Batata, inglesa, cozida','batata inglesa':'Batata, inglesa, cozida','batata cozida':'Batata, inglesa, cozida','batata doce':'Batata, doce, cozida','batata frita':'Batata, inglesa, frita','batata saute':'Batata, inglesa, sauté','batata palha':'Batata, frita, tipo chips, industrializada','mandioquinha':'Batata, baroa, cozida','batata baroa':'Batata, baroa, cozida','inhame':'Cará, cozido','cara':'Cará, cozido',
  'mandioca':'Mandioca, cozida','macaxeira':'Mandioca, cozida','aipim':'Mandioca, cozida','mandioca cozida':'Mandioca, cozida','macaxeira cozida':'Mandioca, cozida','mandioca frita':'Mandioca, frita','macaxeira frita':'Mandioca, frita','aipim frito':'Mandioca, frita',
  'alface':'Alface, crespa, crua','alface americana':'Alface, americana, crua','alface lisa':'Alface, lisa, crua','alface roxa':'Alface, roxa, crua','tomate':'Tomate, com semente, cru','salada de tomate':'Tomate, salada','salada de alface':'Alface, crespa, crua','salada de legumes':'Salada, de legumes, cozida no vapor','legumes':'Salada, de legumes, cozida no vapor','legumes cozidos':'Salada, de legumes, cozida no vapor','maionese de batata':'Salada, de legumes, com maionese','salada de maionese':'Salada, de legumes, com maionese','salpicao':'Salpicão, de frango','tabule':'Tabule','vinagrete':'Tomate, salada',
  'cenoura':'Cenoura, crua','cenoura cozida':'Cenoura, cozida','beterraba':'Beterraba, cozida','beterraba crua':'Beterraba, crua','pepino':'Pepino, cru','cebola':'Cebola, crua','pimentao':'Pimentão, verde, cru','repolho':'Repolho, branco, cru','repolho roxo':'Repolho, roxo, cru','rucula':'Rúcula, crua','agriao':'Agrião, cru','couve':'Couve, manteiga, refogada','couve refogada':'Couve, manteiga, refogada','couve flor':'Couve-flor, cozida','brocolis':'Brócolis, cozido','espinafre':'Espinafre, Nova Zelândia, refogado','chuchu':'Chuchu, cozido','abobrinha':'Abobrinha, italiana, cozida','abobora':'Abóbora, cabotian, cozida','jerimum':'Abóbora, cabotian, cozida','berinjela':'Berinjela, cozida','quiabo':'Quiabo, cru','maxixe':'Maxixe, cru','jilo':'Jiló, cru','vagem':'Vagem, crua','palmito':'Palmito, pupunha, em conserva','azeitona':'Azeitona, verde, conserva','cheiro verde':'Salsa, crua','alho':'Alho, cru','vinagreira':'Cuxá, molho','cuxa':'Cuxá, molho','molho de tomate':'Tomate, molho industrializado','extrato de tomate':'Tomate, extrato',
  // pratos do Norte
  'tacaca':'Tacacá','manicoba':'Maniçoba','tucupi':'Tucupi, com pimenta-de-cheiro','vatapa':'Vatapá','pupunha':'Pupunha, cozida','tucuma':'Tucumã, cru','cupuacu':'Cupuaçu, polpa, congelada','castanha':'Castanha-do-Brasil, crua','castanha do para':'Castanha-do-Brasil, crua','castanha do brasil':'Castanha-do-Brasil, crua','castanha de caju':'Castanha-de-caju, torrada, salgada',
  // frutas
  'banana':'Banana, prata, crua','banana prata':'Banana, prata, crua','banana nanica':'Banana, nanica, crua','banana dagua':'Banana, nanica, crua','banana maca':'Banana, maçã, crua','banana da terra':'Banana, da terra, crua','banana comprida':'Banana, da terra, crua','banana pacova':'Banana, pacova, crua','banana ouro':'Banana, ouro, crua','banana frita':'Banana, da terra, crua',
  'maca':'Maçã, Fuji, com casca, crua','laranja':'Laranja, pêra, crua','tangerina':'Tangerina, Poncã, crua','mexerica':'Mexerica, Rio, crua','ponca':'Tangerina, Poncã, crua','mamao':'Mamão, Papaia, cru','papaia':'Mamão, Papaia, cru','mamao formosa':'Mamão, Formosa, cru','melancia':'Melancia, crua','melao':'Melão, cru','abacaxi':'Abacaxi, cru','manga':'Manga, Tommy Atkins, crua','uva':'Uva, Itália, crua','pera':'Pêra, Williams, crua','pessego':'Pêssego, Aurora, cru','goiaba':'Goiaba, vermelha, com casca, crua','morango':'Morango, cru','kiwi':'Kiwi, cru','abacate':'Abacate, cru','acerola':'Acerola, crua','caju':'Caju, cru','maracuja':'Maracujá, cru','graviola':'Graviola, crua','jaca':'Jaca, crua','caqui':'Caqui, chocolate, cru','ameixa':'Ameixa, crua','limao':'Limão, tahiti, cru','coco':'Coco, cru','jabuticaba':'Jabuticaba, crua','pitanga':'Pitanga, crua','caja':'Cajá-Manga, cru','seriguela':'Ciriguela, crua','ciriguela':'Ciriguela, crua','carambola':'Carambola, crua','figo':'Figo, cru','roma':'Romã, crua','pinha':'Pinha, crua','ata':'Pinha, crua','fruta do conde':'Pinha, crua','abiu':'Abiu, cru','jambo':'Jambo, cru','umbu':'Umbu, cru','pequi':'Pequi, cru','tamarindo':'Tamarindo, cru',
  'acai':'Açaí, polpa, congelada','acai puro':'Açaí, polpa, congelada','acai batido':'Açaí, polpa, congelada','polpa de acai':'Açaí, polpa, congelada','acai na tigela':'Açaí, polpa, com xarope de guaraná e glucose','acai com guarana':'Açaí, polpa, com xarope de guaraná e glucose','acai de tigela':'Açaí, polpa, com xarope de guaraná e glucose',
  // bebidas
  'leite':LEITE,'leite integral':LEITE,'leite de vaca':LEITE,'leite desnatado':'Leite, de vaca, desnatado (média)','leite semidesnatado':'Leite, de vaca, semidesnatado (média)','leite em po':'Leite, de vaca, integral, pó','leite de cabra':'Leite, de cabra','leite de soja':'Soja, extrato solúvel, natural, fluido','leite de coco':'Leite, de coco','leite condensado':'Leite, condensado','creme de leite':'Creme de Leite','achocolatado':'Leite, de vaca, achocolatado','toddynho':'Leite, de vaca, achocolatado','nescau':'Leite, de vaca, achocolatado','toddy':'Leite, de vaca, achocolatado','leite com achocolatado':'Leite, de vaca, achocolatado','achocolatado em po':'Achocolatado, pó','leite fermentado':'Leite, fermentado','yakult':'Leite, fermentado','bebida lactea':'Bebida láctea, pêssego',
  'iogurte':'Iogurte, natural','iogurte natural':'Iogurte, natural','iogurte desnatado':'Iogurte, natural, desnatado','iogurte de morango':'Iogurte, sabor morango','iogurte de fruta':'Iogurte, sabor morango','iogurte de pessego':'Iogurte, sabor pêssego','danone':'Iogurte, sabor morango','danoninho':'Queijo, petit suisse, morango','petit suisse':'Queijo, petit suisse, morango',
  'cafe':'Café, infusão 10%','cafezinho':'Café, infusão 10%','cafe preto':'Café, infusão 10%','cafe puro':'Café, infusão 10%','cha':'Chá, preto, infusão 5%','cha preto':'Chá, preto, infusão 5%','cha mate':'Chá, mate, infusão 5%','mate':'Chá, mate, infusão 5%','cha de erva doce':'Chá, erva-doce, infusão 5%','capuccino':'Capuccino, pó','cappuccino':'Capuccino, pó',
  'suco':'Laranja, pêra, suco','suco natural':'Laranja, pêra, suco','suco de laranja':'Laranja, pêra, suco','suco de caju':'Caju, suco concentrado, envasado','suco de maracuja':'Maracujá, suco concentrado, envasado','suco de uva':'Uva, suco concentrado, envasado','suco de acerola':'Acerola, polpa, congelada','suco de manga':'Manga, polpa, congelada','suco de abacaxi':'Abacaxi, polpa, congelada','suco de cupuacu':'Cupuaçu, polpa, congelada','suco de caja':'Cajá, polpa, congelada','suco de graviola':'Graviola, polpa, congelada','suco de goiaba':'Goiaba, vermelha, com casca, crua','suco de tangerina':'Tangerina, Poncã, suco','suco de limao':'Limão, galego, suco','limonada':'Limão, galego, suco','suco de umbu':'Umbu, polpa, congelada','caldo de cana':'Cana, caldo de','garapa':'Cana, caldo de',
  'agua':'Água, potável (média)','agua mineral':'Água, potável (média)','agua com gas':'Água, potável (média)','agua de coco':'Coco, água de','refrigerante':'Refrigerante, tipo cola','refri':'Refrigerante, tipo cola','coca':'Refrigerante, tipo cola','coca cola':'Refrigerante, tipo cola','refrigerante de cola':'Refrigerante, tipo cola','guarana':'Refrigerante, tipo guaraná','refrigerante de guarana':'Refrigerante, tipo guaraná','fanta':'Refrigerante, tipo laranja','refrigerante de laranja':'Refrigerante, tipo laranja','sprite':'Refrigerante, tipo limão','soda':'Refrigerante, tipo limão','tonica':'Refrigerante, tipo água tônica','agua tonica':'Refrigerante, tipo água tônica','refrigerante zero':'Refrigerante, zero (média)','coca zero':'Refrigerante, zero (média)','guarana zero':'Refrigerante, zero (média)','refri zero':'Refrigerante, zero (média)','isotonico':'Bebida isotônica, sabores variados','gatorade':'Bebida isotônica, sabores variados',
  'cerveja':'Cerveja, pilsen 2','cerva':'Cerveja, pilsen 2','chopp':'Cerveja, pilsen 2','chope':'Cerveja, pilsen 2','vinho':'Vinho, tinto (média)','vinho tinto':'Vinho, tinto (média)','cachaca':'Cana, aguardente 1','pinga':'Cana, aguardente 1','caipirinha':'Cana, aguardente 1',
  // laticínios e gorduras
  'queijo':'Queijo, minas, frescal','queijo minas':'Queijo, minas, frescal','queijo branco':'Queijo, minas, frescal','queijo frescal':'Queijo, minas, frescal','queijo meia cura':'Queijo, minas, meia cura','queijo coalho':'Queijo, minas, meia cura','queijo de coalho':'Queijo, minas, meia cura','mussarela':'Queijo, mozarela','mucarela':'Queijo, mozarela','muzzarela':'Queijo, mozarela','queijo mussarela':'Queijo, mozarela','queijo prato':'Queijo, prato','parmesao':'Queijo, parmesão','queijo ralado':'Queijo, parmesão','ricota':'Queijo, ricota','requeijao':'Queijo, requeijão, cremoso','queijo cremoso':'Queijo, requeijão, cremoso','tofu':'Soja, queijo (tofu)',
  'manteiga':'Manteiga, com sal','margarina':'Margarina, com óleo hidrogenado, com sal (65% de lipídeos)','azeite':'Azeite, de oliva, extra virgem','azeite de oliva':'Azeite, de oliva, extra virgem','azeite de dende':'Azeite, de dendê','oleo':'Óleo, de soja','oleo de soja':'Óleo, de soja','maionese':'Maionese, tradicional com ovos','chantilly':'Chantilly, spray, com gordura vegetal',
  // cereais, suplementos, doces
  'aveia':'Aveia, flocos, crua','farelo de aveia':'Aveia, flocos, crua','granola':'Granola (média)','whey':'Whey protein (média)','whey protein':'Whey protein (média)','sucrilhos':'Cereal matinal, milho, açúcar','cereal':'Cereal matinal, milho','sucrilho':'Cereal matinal, milho, açúcar','flocos de milho':'Cereais, milho, flocos, sem sal','linhaca':'Linhaça, semente','gergelim':'Gergelim, semente','amendoim':'Amendoim, torrado, salgado','noz':'Noz, crua','nozes':'Noz, crua','amendoa':'Amêndoa, torrada, salgada',
  'acucar':'Açúcar, refinado','acucar mascavo':'Açúcar, mascavo','acucar cristal':'Açúcar, cristal','mel':'Mel, de abelha','melado':'Melado','rapadura':'Rapadura','doce de leite':'Doce, de leite, cremoso','goiabada':'Goiaba, doce em pasta','marmelada':'Marmelada','cocada':'Cocada branca','quindim':'Quindim','doce de abobora':'Doce, de abóbora, cremoso','bananada':'Banana, doce em barra','geleia':'Geléia, mocotó, natural',
  'chocolate':'Chocolate, ao leite','chocolate ao leite':'Chocolate, ao leite','chocolate amargo':'Chocolate, meio amargo','chocolate meio amargo':'Chocolate, meio amargo','bombom':'Chocolate, ao leite','barra de chocolate':'Chocolate, ao leite','sorvete':'Sorvete, de massa (média)','gelatina':'Gelatina, sabores variados, pó',
  'shoyu':'Shoyu','molho shoyu':'Shoyu',
};

/* Pratos combinados: termo → partes [nome, fração do peso]. */
const COMBOS = {
  'salada':[['Alface, crespa, crua',.5],['Tomate, com semente, cru',.5]],
  'salada verde':[['Alface, crespa, crua',.5],['Tomate, com semente, cru',.5]],
  'salada simples':[['Alface, crespa, crua',.5],['Tomate, com semente, cru',.5]],
  'salada de alface e tomate':[['Alface, crespa, crua',.5],['Tomate, com semente, cru',.5]],
  'salada mista':[['Alface, crespa, crua',.4],['Tomate, com semente, cru',.4],['Cenoura, crua',.2]],
  'cafe com leite':[['Café, infusão 10%',.5],[LEITE,.5]],
  'pingado':[['Café, infusão 10%',.7],[LEITE,.3]],
  'misto quente':[['Pão, trigo, forma, integral',.55],['Queijo, mozarela',.25],['Presunto, sem capa de gordura',.2]],
  'misto':[['Pão, trigo, forma, integral',.55],['Queijo, mozarela',.25],['Presunto, sem capa de gordura',.2]],
  'x burguer':[['Pão, de hambúrguer (média)',.35],['Hambúrguer, bovino, grelhado',.53],['Queijo, mozarela',.12]],
  'x burger':[['Pão, de hambúrguer (média)',.35],['Hambúrguer, bovino, grelhado',.53],['Queijo, mozarela',.12]],
  'x salada':[['Pão, de hambúrguer (média)',.3],['Hambúrguer, bovino, grelhado',.45],['Queijo, mozarela',.1],['Alface, crespa, crua',.07],['Tomate, com semente, cru',.08]],
  'cachorro quente':[['Pão, trigo, francês',.43],['Salsicha (média)',.39],['Tomate, molho industrializado',.18]],
  'vitamina':[[LEITE,.75],['Banana, prata, crua',.25]],
  'vitamina de banana':[[LEITE,.75],['Banana, prata, crua',.25]],
  'vitamina de abacate':[[LEITE,.7],['Abacate, cru',.3]],
  'vitamina de mamao':[[LEITE,.7],['Mamão, Papaia, cru',.3]],
  'arroz com feijao':[['Arroz, tipo 1, cozido',.55],['Feijão, carioca, cozido',.45]],
  'pao com manteiga':[['Pão, trigo, francês',.83],['Manteiga, com sal',.17]],
  'pao com ovo':[['Pão, trigo, francês',.5],['Ovo, de galinha, inteiro, frito',.5]],
};

/* Peso de medidas caseiras (g), genérico. Cada alimento pode sobrescrever em PROFILES.m */
const MEASURE_G = {concha:130,escumadeira:90,pegador:100,colher:15,colher_cha:5,colher_sobremesa:10,colher_servir:45,xicara:160,
  copo:200,copo_americano:190,copo_duplo:300,copinho:80,caneca:300,lata:350,garrafa:600,garrafinha:500,longneck:355,caixinha:200,taca:150,dose:50,
  fatia:25,rodela:10,pedaco:80,bife:100,file:120,posta:150,espeto:100,unidade:null,prato:300,prato_fundo:400,porcao:100,tigela:300,cumbuca:250,cuia:400,
  pote:170,pacote:100,saco:30,bola:60,punhado:30,scoop:30,sache:5,tablete:25,barra:25,gomo:60,cacho:150,ponta:5,fio:5};
/* Reconhecimento das medidas (texto já normalizado). Ordem importa: o mais específico primeiro. */
const MEASURES = [
  ['colher_servir',/^colher(?:es)? (?:de )?(?:servir|servico)\b/],
  ['colher_cha',/^(?:colher(?:es|inha|inhas)? (?:de )?cha|colherzinhas?|colherinhas?)\b/],
  ['colher_sobremesa',/^colher(?:es)? (?:de )?sobremesa\b/],
  ['colher',/^colher(?:es)?(?: (?:de )?sopa)?\b/],
  ['concha',/^conch(?:a|as|inha|inhas)\b/],['escumadeira',/^escumadeiras?\b/],['pegador',/^pegador(?:es)?\b/],
  ['xicara',/^xicaras?(?: (?:de )?(?:cha|cafe)(?= de\b))?\b/],
  ['copo_duplo',/^copos? duplos?\b/],['copo_americano',/^copos? americanos?\b/],['copinho',/^copinhos?\b/],['copo',/^(?:copo|copos|copao)\b/],['caneca',/^canecas?\b/],
  ['garrafinha',/^garrafinhas?\b/],['longneck',/^long ?necks?\b/],['garrafa',/^garrafas?\b/],['lata',/^lat(?:a|as|inha|inhas)\b/],['caixinha',/^caix(?:a|as|inha|inhas)\b/],['taca',/^tacas?\b/],['dose',/^doses?\b/],
  ['fatia',/^fati(?:a|as|nha|nhas)\b/],['rodela',/^rodelas?\b/],['pedaco',/^pedac(?:o|os|inho|inhos|ao)\b/],['bife',/^bifes?\b/],['file',/^files?\b/],['posta',/^postas?\b/],['espeto',/^espet(?:o|os|inho|inhos)\b/],
  ['unidade',/^(?:unidades?|unid|un)\b/],['prato_fundo',/^pratos? fundos?\b/],['prato',/^prat(?:o|os|inho|inhos)(?: raso| feito)?\b/],['porcao',/^porc(?:ao|oes|aozinha)\b/],
  ['tigela',/^tigel(?:a|as|inha|inhas)\b/],['cumbuca',/^cumbucas?\b/],['cuia',/^cui(?:a|as|nha)\b/],['pote',/^pot(?:e|es|inho|inhos)\b/],['pacote',/^pac(?:ote|otes|otinho|otinhos)\b/],['saco',/^sa(?:co|cos|quinho|quinhos)\b/],
  ['bola',/^bol(?:a|as|inha)(?= de\b)/],['punhado',/^punhados?\b/],['scoop',/^(?:scoops?|medidas?|medidor(?:es)?)\b/],['sache',/^saches?\b/],['tablete',/^tabletes?\b/],['barra',/^barr(?:a|as|inha|inhas)\b/],
  ['gomo',/^gomos?\b/],['cacho',/^cachos?\b/],['ponta',/^ponta de faca\b/],['fio',/^fio\b/],
];
/* Ajustes de tamanho ("copo grande", "colher cheia", "banana pequena"). */
const SIZE = {grande:1.5,grandes:1.5,grandao:1.7,grandona:1.7,pequeno:.7,pequena:.7,pequenos:.7,pequenas:.7,pequenininho:.5,pequenininha:.5,medio:1,media:1,medios:1,medias:1,
  cheio:1.3,cheia:1.3,cheios:1.3,cheias:1.3,rasa:.75,raso:.75,rasas:.75,fina:.6,fino:.6,finas:.6,grossa:1.4,grosso:1.4,grossas:1.4,generosa:1.3,generoso:1.3};

/* Porção por alimento: u = peso de 1 unidade, d = porção padrão (sem quantidade), m = medidas próprias.
   O regex é testado no termo dito (singular) + nome do alimento. Primeiro que casar vale. */
const PROFILES = [
  [/^pao com ovo/, {u:100, d:100}],
  [/^pao com manteiga/, {u:60, d:60}],
  [/^(?:salada|alface|rucula|agriao|folha|vinagrete)/, {d:80, m:{prato:100,porcao:80,colher:15,pegador:30}}],
  [/feijoada/, {d:300, m:{concha:150,prato:350,colher:30}}],
  [/baiao|carreteiro|arroz com feijao/, {d:200, m:{colher:30,escumadeira:100,concha:150}}],
  [/arroz/, {d:150, m:{colher:25,escumadeira:90,concha:130,xicara:160,pegador:100}}],
  [/tropeiro/, {d:150, m:{colher:30,concha:130}}],
  [/feijao|lentilha|grao de bico|ervilha/, {d:140, m:{concha:140,colher:20,escumadeira:90,xicara:160}}],
  [/miojo|instantaneo|lamen/, {u:85, d:85, m:{pacote:85}}],
  [/macarr|espaguete|talharim|parafuso|penne|massa|lasanha|nhoque|yakisoba/, {d:180, m:{pegador:110,escumadeira:110,colher:30,prato:300,pedaco:200,concha:150}}],
  [/pure/, {d:150, m:{colher:40,concha:150}}],
  [/sopa|caldo|canja/, {d:300, m:{concha:150,prato:350,prato_fundo:400,tigela:350,cumbuca:300,copo:250,xicara:240}}],
  [/farofa|farinha/, {d:30, m:{colher:15,colher_cha:5,xicara:120,punhado:30}}],
  [/cuscuz/, {d:150, m:{fatia:100,pedaco:100,colher:30,prato:200}}],
  [/tapioca|beiju/, {u:80, d:80}],
  [/goma|polvilho/, {d:30, m:{colher:15}}],
  [/tacaca/, {u:400, d:400, m:{cuia:400}}],
  [/acai/, {u:300, d:300, m:{tigela:400,copo:300,cuia:400,colher:20,pote:300}}],
  [/codorna/, {u:10, d:50}],
  [/omelete/, {u:120, d:120}],
  [/ovo|clara|gema/, {u:50, d:50, m:{colher:25}}],
  [/pao de queijo/, {u:30, d:60}],
  [/pao de hamburguer/, {u:60, d:60}],
  [/torrada/, {u:10, d:30}],
  [/pao (?:de forma|integral)|forma/, {u:25, d:50, m:{fatia:25}}],
  [/^pao|pao trigo|cacetinho/, {u:50, d:50, m:{fatia:20}}],
  [/x burg|x salada/, {u:170, d:170}],
  [/cachorro quente/, {u:115, d:115}],
  [/misto/, {u:90, d:90}],
  [/biscoito|bolacha|cream cracker|wafer|maisena/, {u:7, d:30, m:{pacote:130}}],
  [/bolo/, {u:60, d:60, m:{fatia:60,pedaco:60}}],
  [/pizza/, {u:110, d:220, m:{fatia:110,pedaco:110}}],
  [/coxinha|salgad|pastel|empad|quibe|kibe|croquete|bolinho|acaraje/, {u:80, d:80}],
  [/hamburg/, {u:90, d:90}],
  [/salsicha/, {u:45, d:90}],
  [/linguica|calabresa/, {u:80, d:80, m:{gomo:80,rodela:8}}],
  [/presunto|mortadela|peito de peru|apresuntado|salame/, {u:15, d:30, m:{fatia:15}}],
  [/requeijao|queijo cremoso/, {d:20, m:{colher:30,colher_cha:10,ponta:10}}],
  [/parmesao|queijo ralado/, {d:10, m:{colher:6,colher_cha:2}}],
  [/queijo|mussarela|mucarela|muzzarela|ricota|tofu/, {u:30, d:30, m:{fatia:20,pedaco:30,colher:15}}],
  [/manteiga|margarina/, {d:10, m:{colher:12,colher_cha:4,ponta:5}}],
  [/maionese|chantilly/, {d:15, m:{colher:15,colher_cha:5}}],
  [/azeite|oleo/, {d:8, m:{colher:10,colher_cha:4,fio:5}}],
  [/achocolatado em po|achocolatado po/, {d:20, m:{colher:12,colher_cha:5}}],
  [/acucar/, {d:10, m:{colher:12,colher_cha:5,sache:5}}],
  [/mel|melado/, {d:20, m:{colher:20,colher_cha:7,sache:10}}],
  [/leite em po|leite de vaca integral po/, {d:30, m:{colher:15,colher_cha:5}}],
  [/leite condensado|creme de leite|doce de leite/, {d:20, m:{colher:20,colher_cha:7,lata:395,caixinha:200}}],
  [/iogurte|danone|danoninho|petit suisse|yakult|leite fermentado|bebida lactea/, {u:170, d:170, m:{pote:170,copo:200,colher:20,garrafinha:170}}],
  [/cafe com leite|pingado|vitamina|achocolatado|toddy|nescau/, {u:250, d:250, m:{xicara:240,copo:250,caneca:300}}],
  [/leite/, {d:200, m:{xicara:240,copo:200,caixinha:200,colher:15}}],
  [/capuccino|cappuccino/, {d:20, m:{colher:12,sache:20}}],
  [/cafe/, {u:50, d:50, m:{xicara:80,copo:150,copinho:50,caneca:250,garrafa:500}}],
  [/^cha|^mate/, {u:200, d:200, m:{xicara:200,copo:200,caneca:300}}],
  [/cerveja|cerva|chop/, {u:350, d:350, m:{lata:350,garrafa:600,copo:300,taca:300}}],
  [/vinho/, {u:150, d:150, m:{taca:150,copo:200,garrafa:750}}],
  [/cachaca|pinga|aguardente|caipirinha/, {u:50, d:50, m:{dose:50,copo:100,copinho:50}}],
  [/refri|coca|guarana|fanta|sprite|soda|tonica|refrigerante/, {u:350, d:350, m:{lata:350,garrafa:600,copo:250,garrafinha:600}}],
  [/agua de coco|coco agua/, {u:300, d:300, m:{copo:250}}],
  [/^agua/, {u:200, d:300, m:{garrafa:500,garrafinha:500,copo:200}}],
  [/suco|limonada|caldo de cana|garapa|isotonico|gatorade/, {u:250, d:250, m:{copo:250,lata:330,caixinha:200,garrafinha:500,jarra:1000}}],
  [/sorvete|picole/, {u:60, d:120, m:{bola:60,pote:500,taca:150}}],
  [/bombom/, {u:20, d:20}],
  [/chocolate/, {u:25, d:25, m:{barra:90,tablete:25,pedaco:10,quadrado:5}}],
  [/castanha do|castanha$|castanha brasil|castanha-do/, {u:4, d:20, m:{punhado:20}}],
  [/castanha de caju|amendoim|amendoa|noz/, {u:2, d:30, m:{punhado:30,colher:15,pacote:50}}],
  [/pacoca|pe de moleque/, {u:20, d:20}],
  [/rapadura|goiabada|bananada|marmelada|cocada|quindim/, {u:30, d:30, m:{pedaco:30,fatia:30}}],
  [/whey/, {d:30, m:{scoop:30,dose:30,colher:15}}],
  [/aveia|linhaca|gergelim/, {d:30, m:{colher:15,colher_cha:5,xicara:80}}],
  [/granola/, {d:40, m:{colher:12,xicara:110}}],
  [/cereal|sucrilho|flocos/, {d:30, m:{xicara:30,tigela:40,colher:6}}],
  [/pipoca/, {d:30, m:{saco:30,pacote:50,tigela:30,xicara:10}}],
  [/chips|batata palha/, {d:30, m:{pacote:50,punhado:20,colher:5}}],
  [/atum|sardinha em|sardinha conserva/, {u:25, d:60, m:{lata:120,colher:20}}],
  [/sardinha/, {u:25, d:100}],
  [/camarao/, {u:10, d:100, m:{colher:25}}],
  [/estrogonofe|strogonoff|vaca atolada|vatapa|manicoba|sarapatel|dobradinha|barreado|quibebe|galinhada|salpicao|tabule|charuto|picadinho/, {d:200, m:{concha:150,colher:30,prato:300,escumadeira:100}}],
  [/coxa|sobrecoxa/, {u:90, d:120}],
  [/^(?:file de frango|file de peixe|file)\b/, {u:120, d:120, m:{file:120,pedaco:100}}],
  [/^bife/, {u:100, d:100, m:{bife:100,pedaco:100}}],
  [/carne moida|moida|moido/, {d:100, m:{colher:25,concha:120,escumadeira:90}}],
  [/costela/, {d:200, m:{pedaco:150}}],
  [/figado/, {u:100, d:100}],
  [/coracao/, {u:6, d:100, m:{espeto:100}}],
  [/bisteca/, {u:120, d:120}],
  [/carne|bife|file|frango|galinha|peixe|tilapia|pescada|merluza|pintado|tucunare|salmao|bacalhau|porco|lombo|pernil|picanha|patinho|alcatra|maminha|contra|fraldinha|cupim|lagarto|musculo|acem|coxao|charque|jaba|peito|sassami|toucinho|bacon|torresmo|almondega/, {d:120, m:{pedaco:100,bife:100,file:120,posta:150,colher:25,espeto:100}}],
  [/banana da terra|banana comprida|banana frita/, {u:150, d:150}],
  [/banana/, {u:70, d:70}],
  [/maca/, {u:130, d:130}],
  [/laranja/, {u:160, d:160, m:{gomo:10}}],
  [/tangerina|mexerica|ponca/, {u:120, d:120, m:{gomo:10}}],
  [/pera/, {u:150, d:150}],
  [/pessego|caqui/, {u:110, d:110}],
  [/kiwi/, {u:75, d:75}],
  [/goiaba/, {u:170, d:170}],
  [/manga/, {u:250, d:250, m:{fatia:80}}],
  [/mamao|papaia/, {u:300, d:150, m:{fatia:150,pedaco:100}}],
  [/melancia|melao|abacaxi/, {d:200, m:{fatia:200,pedaco:100}}],
  [/uva/, {u:7, d:100, m:{cacho:150}}],
  [/morango|acerola|jabuticaba|pitanga|ciriguela|seriguela|umbu|jambo|caja/, {u:10, d:100}],
  [/abacate/, {d:100, m:{colher:30}}],
  [/caju/, {u:80, d:80}],
  [/limao/, {u:70, d:70}],
  [/coco/, {d:50, m:{pedaco:50}}],
  [/pupunha/, {u:20, d:60}],
  [/tucuma/, {u:30, d:60}],
  [/batata frita/, {d:100, m:{porcao:150,pacote:100}}],
  [/batata doce/, {u:150, d:150, m:{pedaco:80,rodela:20}}],
  [/batata|mandioquinha|cara|inhame/, {u:130, d:150, m:{pedaco:60,colher:30}}],
  [/mandioca|macaxeira|aipim/, {d:150, m:{pedaco:100}}],
  [/tomate/, {u:100, d:80, m:{fatia:15,rodela:15,colher:20}}],
  [/cenoura|beterraba|pepino|chuchu|abobrinha|berinjela|cebola|pimentao/, {u:100, d:80, m:{colher:25,rodela:10,fatia:15}}],
  [/brocolis|couve|repolho|vagem|quiabo|abobora|jerimum|espinafre|legume|maxixe|jilo|palmito/, {d:80, m:{colher:25,xicara:80}}],
  [/milho/, {d:50, m:{colher:25,espiga:100}}],
  [/azeitona/, {u:4, d:20}],
];
const DEFAULT_PROFILE = {d:100, m:{}};

/* Números por extenso. */
const NUMW = {zero:0,um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,treze:13,quatorze:14,catorze:14,quinze:15,
  dezesseis:16,dezasseis:16,dezessete:17,dezoito:18,dezenove:19,vinte:20,trinta:30,quarenta:40,cinquenta:50,cinquente:50,sessenta:60,setenta:70,oitenta:80,noventa:90,
  cem:100,cento:100,duzentos:200,duzentas:200,trezentos:300,trezentas:300,quatrocentos:400,quatrocentas:400,quinhentos:500,quinhentas:500,seiscentos:600,seiscentas:600,
  setecentos:700,setecentas:700,oitocentos:800,oitocentas:800,novecentos:900,novecentas:900,mil:1000,meio:.5,meia:.5};
const WEIGHT_UNITS = {g:1,gr:1,grs:1,grama:1,gramas:1,gramos:1,kg:1000,kgs:1000,quilo:1000,quilos:1000,kilo:1000,kilos:1000,ml:1,mls:1,mililitro:1,mililitros:1,l:1000,lt:1000,litro:1000,litros:1000};
const AMOUNT = {pouco:.5,pouquinho:.3,poquinho:.3,bocado:.5,bastante:1.5,muito:1.5,montao:2};
const CONNECT = new Set(['e','mais','com','tambem','junto','alem']);
const PREP = new Set(['de','do','da','dos','das']);
const FILLER = new Set(['eu','comi','comeu','comemos','tomei','tomou','bebi','bebeu','ingeri','hoje','agora','ontem','entao','ai','la','aproximadamente','cerca','quase','uns','umas',
  'foi','teve','tinha','so','apenas','somente','meu','minha','meus','minhas','o','a','os','as','no','na','nos','nas','num','numa','pro','pra','para','ao','aos','que','depois','antes','tipo','registrar','registra','anota','anotar','adiciona','adicionar','coloca','colocar','bem','servido','servida','aquele','aquela','um pouco']);
const STOP_SEARCH = new Set(['de','do','da','dos','das','e','o','a','os','as','bem','tipo','um','uma']);
const NO_SING = new Set(['brocolis','ananas','tres','mais','pires','lapis','gas','arroz','cuscuz','x','chips','apos','atras','pois','jus','bis']);

/* ---------- utilidades ---------- */
// mesma normalização do app (chaves do dicionário pessoal)
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
// normalização do ditado: mantém o ponto decimal entre dígitos, separa "200g" → "200 g"
function normText(s){
  let t=String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
  t=t.replace(/½/g,' meio ').replace(/(\d+)\s*\/\s*(\d+)/g,(m,a,b)=>+b?String(+a/+b):m);
  t=t.replace(/(\d)[.,](\d)/g,'$1\u0001$2').replace(/[^a-z0-9\u0001 ]/g,' ').replace(/\u0001/g,'.');
  t=t.replace(/(\d)([a-z])/g,'$1 $2').replace(/([a-z])(\d)/g,'$1 $2');
  return t.replace(/\s+/g,' ').trim();
}
// singular simples (feijões→feijao, pães→pao, colheres→colher, ovos→ovo)
function sing(w){
  if(w.length<=3 || NO_SING.has(w) || /\d/.test(w)) return w;
  if(/oes$/.test(w)) return w.slice(0,-3)+'ao';
  if(/aes$/.test(w)) return w.slice(0,-3)+'ao';
  if(/ais$/.test(w)) return w.slice(0,-2)+'l';
  if(/eis$/.test(w)) return w.slice(0,-2)+'l';
  if(/ns$/.test(w)) return w.slice(0,-2)+'m';
  if(/[rz]es$/.test(w)) return w.slice(0,-2);
  if(/s$/.test(w) && !/ss$/.test(w)) return w.slice(0,-1);
  return w;
}
const skey = words => words.map(sing).join(' ');
function lev(a,b,max){
  if(Math.abs(a.length-b.length)>max) return max+1;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){ const cur=[i]; let best=i;
    for(let j=1;j<=b.length;j++){ cur[j]=Math.min(prev[j]+1,cur[j-1]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1)); if(cur[j]<best) best=cur[j]; }
    if(best>max) return max+1; prev=cur; }
  return prev[b.length];
}
const stem = w => { w=sing(w); return w.length>4 ? w.replace(/[aoe]$/,'') : w; };
// casamento tolerante de palavras (gênero, plural, prefixo, erro de digitação)
function tokMatch(q,w){
  if(q===w) return true;
  const a=stem(q), b=stem(w); if(a===b) return true;
  if(a.length>=4 && b.startsWith(a)) return true;
  const m=Math.min(a.length,b.length);
  if(m>=4) return lev(a,b,m>=8?2:1)<=(m>=8?2:1);
  return false;
}

/* ---------- estado ---------- */
let TACO=[], TACO_N=[], TACO_T=[], BASE_LEN=0, BAD=new Set();
let NAME_IDX=new Map(), DICT=new Map(), DICT_BY_LEN=new Map(), FIRSTWORDS=new Set(), VOCAB=new Set(), VOCAB_LIST=[];
let CTX={products:{}, aliases:{}, mealNames:['Café da manhã','Almoço','Lanche','Jantar','Ceia']};

function init(rows){
  TACO=(rows||[]).map(r=>r.slice()); BASE_LEN=TACO.length;
  for(const x of EXTRAS) TACO.push(x.slice());
  TACO_N=TACO.map(r=>norm(r[0])); TACO_T=TACO_N.map(n=>n.split(' '));
  NAME_IDX=new Map(); BAD=new Set();
  TACO.forEach((r,i)=>{ if(!NAME_IDX.has(r[0])) NAME_IDX.set(r[0],i);
    // linhas com kcal e macros vazios (ex.: leite na TACO) não entram em busca nem ditado
    if(!(r[1]>0) && !(r[2]>0) && !(r[3]>0) && !(r[4]>0) && !/^(sal|agua)\b/.test(norm(r[0]))) BAD.add(i); });
  FIRSTWORDS=new Set(TACO_T.map(t=>sing(t[0])));
  buildDict();
  return api;
}
function setContext(c){
  c=c||{};
  if(c.products) CTX.products=c.products;
  if(c.aliases) CTX.aliases=c.aliases;
  if(c.mealNames && c.mealNames.length) CTX.mealNames=c.mealNames.slice();
  buildDict();
  return api;
}
// dicionário único: apelidos pessoais > pratos combinados > sinônimos
const dkey = s => skey(norm(s).split(' ').filter(w=>w && !FILLER.has(w)));
function buildDict(){
  DICT=new Map();
  for(const [k,v] of Object.entries(SYN)) DICT.set(dkey(k),{type:'syn',val:v});
  for(const [k,v] of Object.entries(COMBOS)) DICT.set(dkey(k),{type:'combo',val:v});
  for(const [k,v] of Object.entries(CTX.aliases||{})){ const n=dkey(k); if(n) DICT.set(n,{type:'alias',val:v}); }
  // vocabulário conhecido (para corrigir erros de digitação/ditado)
  VOCAB=new Set(); for(const k of DICT.keys()) for(const w of k.split(' ')) VOCAB.add(w);
  for(const t of TACO_T) for(const w of t) VOCAB.add(sing(w));
  VOCAB_LIST=[...VOCAB].filter(w=>w.length>=4);
  DICT_BY_LEN=new Map();
  for(const k of DICT.keys()){ const L=k.split(' ').length; if(!DICT_BY_LEN.has(L)) DICT_BY_LEN.set(L,[]); DICT_BY_LEN.get(L).push(k); }
}

/* ---------- busca de alimentos ---------- */
function rowFood(i){ const r=TACO[i]; return r?{n:r[0], v:r.slice(1,13), src:i>=BASE_LEN?'est':'taco', ref:'T'+i}:null; }
function foodByName(name){ const i=NAME_IDX.get(name); return i==null?null:rowFood(i); }
function foodFromRef(ref){
  if(!ref) return null;
  if(ref[0]==='T') return rowFood(+ref.slice(1));
  if(ref[0]==='P'){ const p=(CTX.products||{})[ref.slice(1)]; return p?{n:p.n, v:p.v, src:'prod', ref, porcao:p.porcao}:null; }
  return null;
}
// pontua candidatos que contêm todas as palavras (tolerante). target = tokens do alimento padrão (para desempate).
function rankFoods(toks, opts={}){
  const out=[], hasCru=toks.some(t=>/^cru/.test(t));
  for(const [code,p] of Object.entries(CTX.products||{})){
    const pt=norm(p.n).split(' ');
    if(toks.every(q=>pt.some(w=>tokMatch(q,w)))) out.push({ref:'P'+code,name:p.n,kcal:p.v&&p.v[0],score:100+toks.length*10-pt.length*.2,first:tokMatch(toks[0],pt[0])});
  }
  for(let i=0;i<TACO.length;i++){
    if(BAD.has(i)) continue;
    const nt=TACO_T[i];
    let ok=true; for(const q of toks){ if(!nt.some(w=>tokMatch(q,w))){ ok=false; break; } }
    if(!ok) continue;
    let s=toks.length*10-nt.length*.3;
    const first=tokMatch(toks[0],nt[0]); if(first) s+=3;
    if(/cozid|grelhad|assad/.test(TACO_N[i])) s+=.6;
    if(/\bcrua?\b|\bcrus\b/.test(TACO_N[i]) && !hasCru) s-=1.5;
    if(/\bpo\b|mistura para|desidratad/.test(TACO_N[i])) s-=1;
    if(opts.target){ for(const w of nt) if(opts.target.includes(w)) s+=1.2; }
    out.push({ref:'T'+i,name:TACO[i][0],kcal:TACO[i][1],score:s,first});
  }
  return out.sort((a,b)=>b.score-a.score);
}
function search(q, max=40){
  const n=normText(q), toks=n.split(' ').filter(t=>t.length>1 && !STOP_SEARCH.has(t));
  if(!toks.length){ const out=[]; for(const [code,p] of Object.entries(CTX.products||{})) out.push({ref:'P'+code,name:p.n,kcal:p.v&&p.v[0]});
    for(let i=0;i<TACO.length && out.length<max;i++) if(!BAD.has(i)) out.push({ref:'T'+i,name:TACO[i][0],kcal:TACO[i][1]}); return out.slice(0,max); }
  const res=rankFoods(toks);
  // termo do dia a dia ("carne", "leite") → alimento padrão no topo
  const d=DICT.get(skey(n.split(' ')));
  if(d && d.type==='syn'){ const f=foodByName(d.val); if(f){ const k=res.findIndex(r=>r.ref===f.ref); if(k>0) res.splice(k,1); if(k!==0) res.unshift({ref:f.ref,name:f.n,kcal:f.v[0]}); } }
  const prods=res.filter(r=>r.ref[0]==='P'), rest=res.filter(r=>r.ref[0]!=='P');
  return prods.concat(rest).slice(0,max).map(r=>({ref:r.ref,name:r.name,kcal:r.kcal}));
}

/* ---------- refeição ---------- */
const ORD = {primeira:1,segunda:2,terceira:3,quarta:4,quinta:5,sexta:6,setima:7,oitava:8};
const MEAL_KW = [ // [regex, quem procurar no nome da refeição, índice padrão]
  [/\b(?:cafe da manha|cafe de manha|cafe matinal|desjejum)\b/, /cafe|manha|desjejum/, 0],
  [/\b(?:almoco|almocei|almocar)\b/, /almoco/, 1],
  [/\b(?:lanche da tarde|lanche da manha|lanche|lanchei|lanchinho|merenda|merendei)\b/, /lanche|merenda/, 2],
  [/\b(?:jantar|janta|jantei)\b/, /jant/, 3],
  [/\b(?:ceia)\b/, /ceia/, 4],
];
const RE_REF = /\b(?:(primeira|segunda|terceira|quarta|quinta|sexta|setima|oitava) refeicao|refeicao (?:numero |n |no |num )?(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito))\b/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function detectMeal(text){
  const n=typeof text==='string'?normText(text):'';
  const names=CTX.mealNames.map(norm), len=names.length;
  const m=n.match(RE_REF);
  if(m){ const k=m[1]?ORD[m[1]]:(NUMW[m[2]]!=null?NUMW[m[2]]:+m[2]); if(k>=1 && k<=len) return k-1; }
  // nomes próprios do usuário (o mais longo primeiro)
  const order=names.map((x,i)=>[x,i]).filter(x=>x[0]).sort((a,b)=>b[0].length-a[0].length);
  for(const [x,i] of order) if(new RegExp('\\b'+esc(x)+'\\b').test(n)) return i;
  let best=null;
  for(const [re,look,def] of MEAL_KW){ const mm=n.match(re); if(!mm) continue;
    if(best && best.pos<=mm.index) continue;
    let idx=names.findIndex(x=>look.test(x)); if(idx<0) idx=def<len?def:null;
    if(idx!=null) best={pos:mm.index,idx};
  }
  return best?best.idx:null;
}
function stripMeal(n){
  n=n.replace(new RegExp(RE_REF.source,'g'),' ');
  const names=CTX.mealNames.map(norm).filter(Boolean).sort((a,b)=>b.length-a.length);
  const pre='\\b(?:(?:no|na|do|da|de|pro|pra|para o|para a|o|a) )?';
  for(const x of names) if(x.includes(' ')) n=n.replace(new RegExp(pre+esc(x)+'\\b','g'),' ');
  for(const [re] of MEAL_KW) n=n.replace(new RegExp(pre+re.source.replace(/^\\b|\\b$/g,'')+'\\b','g'),' ');
  for(const x of names) n=n.replace(new RegExp(pre+esc(x)+'\\b','g'),' ');
  return n.replace(/\b(?:de manha|a tarde|a noite|de noite|de tarde|mais ou menos|por volta de|em torno de)\b/g,' ');
}

/* ---------- leitura de tokens ---------- */
const isNum = t => /^\d+(?:\.\d+)?$/.test(t);
const isNumWord = t => t in NUMW;
// lê um número (dígitos ou por extenso, "duzentos e cinquenta", "uma e meia")
function readNumber(T,i){
  if(i>=T.length) return null;
  if(isNum(T[i])){ let v=parseFloat(T[i]), j=i+1;
    if(T[j]==='e' && (T[j+1]==='meio'||T[j+1]==='meia')){ v+=.5; j+=2; }
    return {v,next:j,digits:true}; }
  if(!isNumWord(T[i])) return null;
  let total=0, cur=0, j=i, last=Infinity, any=false;
  while(j<T.length){
    const w=T[j];
    if(isNumWord(w)){
      const val=NUMW[w];
      if(w==='mil'){ cur=(cur||1)*1000; total+=cur; cur=0; last=1000; j++; any=true;
        if(T[j]==='e' && isNumWord(T[j+1]) && NUMW[T[j+1]]>=1) j++; continue; }
      if(val===.5){ if(any) break; cur+=.5; j++; any=true; last=.5; break; }
      if(any && val>=last) break; // "dois três" não junta
      cur+=val; last=val; j++; any=true;
      // "e" só liga números ("duzentos e cinquenta", "uma e meia")
      if(T[j]==='e' && j+1<T.length && isNumWord(T[j+1]) && (NUMW[T[j+1]]<last || T[j+1]==='meio'||T[j+1]==='meia')){
        if(T[j+1]==='meio'||T[j+1]==='meia'){ cur+=.5; j+=2; break; }
        j++; continue; }
      continue;
    }
    break;
  }
  return any?{v:total+cur,next:j,digits:false}:null;
}
function matchMeasure(T,i){
  const s=T.slice(i,i+5).join(' ');
  for(const [id,re] of MEASURES){ const m=s.match(re); if(m) return {id, len:m[0].trim().split(' ').length}; }
  return null;
}
// procura a chave mais longa do dicionário a partir de i (exata; se fuzzy, tolera erro de digitação)
function dictMatchAt(T,i,fuzzy){
  const maxL=Math.min(7,T.length-i);
  for(let L=maxL;L>=1;L--){ const k=skey(T.slice(i,i+L)); if(DICT.has(k)) return {key:k,len:L,entry:DICT.get(k)}; }
  if(!fuzzy) return null;
  for(let L=maxL;L>=1;L--){
    const ws=T.slice(i,i+L).map(sing), keys=DICT_BY_LEN.get(L)||[];
    for(const k of keys){ const kw=k.split(' ');
      let ok=true; for(let x=0;x<L;x++){ const a=ws[x], b=kw[x]; if(a===b) continue; const m=Math.min(a.length,b.length); if(m<5 || lev(a,b,1)>1){ ok=false; break; } }
      if(ok) return {key:k,len:L,entry:DICT.get(k),fuzzy:true};
    }
  }
  return null;
}
// próximo token começa um item? (número, medida, "pouco", ou alimento conhecido)
function itemStart(T,k){
  if(k>=T.length) return false;
  const t=T[k];
  if(isNum(t) || isNumWord(t) || t in AMOUNT) return true;
  if(matchMeasure(T,k)) return true;
  if(dictMatchAt(T,k,true)) return true;
  return FIRSTWORDS.has(sing(t)) && t.length>2;
}

/* ---------- interpretador do ditado ---------- */
function parse(text){
  const out={meal:detectMeal(String(text||'')), items:[], missing:[]};
  if(!text) return out;
  // 1) separa em pedaços ANTES de normalizar (vírgula, ponto e vírgula, ponto final, quebra de linha)
  let raw=String(text).replace(/(\d),(\d)/g,'$1\u0002$2').replace(/(\d)\.(\d)/g,'$1\u0002$2');
  const chunks=raw.split(/[,;\n\r]+|\.(?!\d)|[!?+]|\s-\s/).map(c=>c.replace(/\u0002/g,'.'));
  let ctx={gramCtx:false};
  for(const c of chunks){
    let n=normText(c); if(!n) continue;
    n=stripMeal(' '+n+' ').replace(/\bum pouco\b/g,'pouco').replace(/\s+/g,' ').trim();
    const T=n.split(' ').filter(t=>t && !FILLER.has(t));
    parseTokens(T,out,ctx);
  }
  return out;
}

function parseTokens(T,out,ctx){
  let i=0;
  while(i<T.length){
    // conectivos/preposições soltos no início do item
    while(i<T.length && (CONNECT.has(T[i]) || PREP.has(T[i]))) i++;
    if(i>=T.length) break;
    const it={qty:null, gramsPer:null, measure:null, size:1, words:[], bare:false};
    // quantidade
    let num=readNumber(T,i);
    if(num){ it.qty=num.v; i=num.next; }
    if(T[i] in AMOUNT){ it.size*=AMOUNT[T[i]]; i++; }
    while(SIZE[T[i]]){ it.size*=SIZE[T[i]]; i++; }
    // unidade de peso/volume
    if(it.qty!=null && T[i] in WEIGHT_UNITS){ it.gramsPer=WEIGHT_UNITS[T[i]]; i++;
      if(T[i]==='e' && (T[i+1]==='meio'||T[i+1]==='meia')){ it.qty+=.5; i+=2; } ctx.gramCtx=true; }
    else {
      const ms=matchMeasure(T,i);
      // "bife"/"filé"/"coxa" podem ser medida ou alimento: medida só se vier "de ..." depois
      if(ms && (!['bife','file'].includes(ms.id) || PREP.has(T[i+ms.len]))){
        it.measure=ms.id; i+=ms.len; if(it.qty==null) it.qty=1;
        while(SIZE[T[i]]){ it.size*=SIZE[T[i]]; i++; }
        if(T[i]==='e' && (T[i+1]==='meio'||T[i+1]==='meia')){ it.qty+=.5; i+=2; }
        while(SIZE[T[i]]){ it.size*=SIZE[T[i]]; i++; }
        ctx.gramCtx=false;
      } else if(it.qty!=null){ it.bare=true; it.bareDe=PREP.has(T[i]); }
    }
    while(i<T.length && PREP.has(T[i])) i++;
    // nome do alimento: chave do dicionário mais longa + palavras seguintes até a fronteira
    const start=i;
    const dm=dictMatchAt(T,i,true);
    if(dm) i+=dm.len;
    while(i<T.length){
      const t=T[i];
      if(isNum(t)) break;
      if(isNumWord(t) && i>start && !PREP.has(T[i-1])) break;
      if(CONNECT.has(t)){ if(itemStart(T,i+1)) break; i++; continue; }
      if(i>start && !PREP.has(T[i-1]) && T[i-1]!=='com' && T[i-1]!=='sem' && dictMatchAt(T,i,false)) break; // "arroz feijão" sem conectivo
      if(i>start && matchMeasure(T,i) && !PREP.has(T[i-1]) && !['bife','file'].includes(matchMeasure(T,i).id)) break;
      i++;
    }
    let words=T.slice(start,i);
    // tamanho dito depois do alimento ("banana grande")
    words=words.filter(w=>{ if(SIZE[w]){ it.size*=SIZE[w]; return false; } return true; });
    while(words.length && (PREP.has(words[words.length-1])||CONNECT.has(words[words.length-1]))) words.pop();
    // quantidade depois do alimento ("arroz 200 gramas")
    if(it.qty==null && i<T.length){
      const pn=readNumber(T,i);
      if(pn && T[pn.next] in WEIGHT_UNITS && !PREP.has(T[pn.next+1])){ it.qty=pn.v; it.gramsPer=WEIGHT_UNITS[T[pn.next]]; i=pn.next+1; ctx.gramCtx=true; }
      else if(pn){ const ms=matchMeasure(T,pn.next);
        if(ms && !PREP.has(T[pn.next+ms.len])){ it.qty=pn.v; it.measure=ms.id; i=pn.next+ms.len; }
        else if(!ms && pn.v>=10 && pn.digits){ it.qty=pn.v; it.gramsPer=1; i=pn.next; } } // ex.: arroz 200
    }
    // medida usada como alimento ("um bife", "um filé")
    if(!words.length && it.measure && ['bife','file'].includes(it.measure)){ words=[it.measure]; it.measure=null; }
    if(!words.length && it.qty==null){ i=Math.max(i,start+1); continue; }
    if(!words.length){ continue; }
    it.words=words;
    emit(it,out,ctx);
  }
}

// devolve {kind:'food', f, key} | {kind:'combo', parts, key} | null
function fixTypos(words){
  let changed=false;
  const fixed=words.map(w=>{ const s=sing(w); if(VOCAB.has(s) || s.length<4 || STOP_SEARCH.has(w)) return w;
    const max=s.length>=8?2:1; let best=null, bd=max+1;
    for(const v of VOCAB_LIST){ if(Math.abs(v.length-s.length)>max) continue; const d=lev(s,v,max); if(d<bd){ bd=d; best=v; } }
    if(best){ changed=true; return best; } return w; });
  return changed?fixed:null;
}
function resolveWords(words, noFix){
  if(!noFix){ const k0=skey(words); if(!DICT.has(k0)){ const fx=fixTypos(words); if(fx){ const r=resolveWords(fx,true); if(r) return r; } } }
  const said=words.join(' '), k=skey(words);
  const al=CTX.aliases||{};
  const a=al[norm(said)]||al[k];
  if(a){ const f=foodFromRef(a.ref); if(f) return {kind:'food',f,key:k}; }
  const d=DICT.get(k);
  if(d) return fromEntry(d,k);
  // busca por palavras na TACO/produtos
  const toks=words.filter(w=>!STOP_SEARCH.has(w) && !/^\d/.test(w));
  const dm=dictMatchAt(words,0,true);
  if(dm && dm.len===words.length) return fromEntry(dm.entry,dm.key);
  let target=null;
  if(dm && dm.entry.type!=='combo'){ const base=fromEntry(dm.entry,dm.key); if(base && base.f) target=norm(base.f.n).split(' '); }
  if(toks.length){
    const r=rankFoods(toks,{target});
    const best=r.find(x=>x.first) || (dm?null:r[0]);
    if(best) return {kind:'food',f:foodFromRef(best.ref),key:k};
  }
  if(dm) return fromEntry(dm.entry,dm.key); // ex.: "frango frito" → frango padrão
  // tenta prefixos (ex.: "tucunare assado" → tucunaré)
  for(let L=toks.length-1;L>=1;L--){
    const r=rankFoods(toks.slice(0,L)); const best=r.find(x=>x.first);
    if(best) return {kind:'food',f:foodFromRef(best.ref),key:skey(toks.slice(0,L))};
  }
  return null;
}
function fromEntry(e,k){
  if(e.type==='alias'){ const f=foodFromRef(e.val.ref); return f?{kind:'food',f,key:k}:null; }
  if(e.type==='combo'){ const parts=e.val.map(([n,fr])=>({f:foodByName(n),fr})).filter(p=>p.f); return parts.length?{kind:'combo',parts,key:k}:null; }
  const f=foodByName(e.val); return f?{kind:'food',f,key:k}:null;
}
function profileFor(key,name){
  const s=key+' | '+norm(name||'');
  for(const [re,p] of PROFILES){ if(re.test(key)) return p; }
  for(const [re,p] of PROFILES){ if(re.test(s)) return p; }
  return DEFAULT_PROFILE;
}
function emit(it,out,ctx){
  const t=it.words.join(' ');
  const r=resolveWords(it.words);
  if(!r){ out.missing.push(t); return; }
  const name=r.kind==='food'?r.f.n:r.parts[0].f.n;
  const prof=profileFor(r.key,name);
  const unit=(r.kind==='food' && r.f.porcao) || prof.u || null;
  let g, est=true;
  if(it.gramsPer!=null){ g=it.qty*it.gramsPer; est=false; }
  else if(it.measure){
    const base= it.measure==='unidade' ? (unit||prof.d) : (prof.m&&prof.m[it.measure]) ?? MEASURE_G[it.measure] ?? prof.d;
    g=base*it.qty*it.size;
  } else if(it.qty!=null){
    // número sem unidade: em contexto de gramas ("200 g de arroz e 100 de feijão") ou grande demais para contagem = gramas
    if(it.qty>=10 && (it.bareDe || !unit || it.qty>30)){ g=it.qty; est=!(it.bareDe && ctx.gramCtx); }
    else g=(unit||prof.d)*it.qty*it.size;
  } else g=prof.d*it.size;
  g=Math.max(1,Math.round(g));
  if(r.kind==='food'){ out.items.push({n:r.f.n, v:r.f.v, src:r.f.src, ref:r.f.ref, g, t, est}); return; }
  let left=g; r.parts.forEach((p,x)=>{ const pg=x===r.parts.length-1?left:Math.max(1,Math.round(g*p.fr)); left-=pg;
    out.items.push({n:p.f.n, v:p.f.v, src:p.f.src, ref:p.f.ref, g:pg, t, est}); });
}

const api={init, setContext, parse, search, foodFromRef, norm, detectMeal,
  _internal:{EXTRAS, SYN, COMBOS, PROFILES, MEASURE_G, normText, sing, tokMatch, readNumber, foodByName, isBad:i=>BAD.has(i)}};
if(typeof module!=='undefined' && module.exports) module.exports=api;
if(root) root.PFParser=api;
})(typeof window!=='undefined'?window:(typeof globalThis!=='undefined'?globalThis:null));
